# DailyMattr Socials — Stress, Flow & Security Report

**Date:** 7 Aug 2026
**Target:** production Supabase (`hqxcinryuiatbybbsrkn`) + `daily-mattr-social-mbge.vercel.app`
**Method:** empirical load/flow tests driven against the live stack, plus a 21-agent
static audit (9 security dimensions, adversarially verified; 12 scale dimensions).

Findings marked **VERIFIED HERE** were reproduced by hand against the real code,
RLS policies or database — not taken from an agent's word.

---

## 0. Executive summary

The **mechanisms are correct; the guardrails are not.**

Points allocation, reversal, idempotency and analytics reconcile exactly at
every scale tested — no double-pays, no lost clicks, no drift. What fails is
everything *around* that core: authorization on writes, deduplication of
free money, and every read path's behaviour past 1,000 rows.

| Area | Verdict |
|---|---|
| Points allocation / reversal / analytics | ✅ Correct, reconciled to the rupee |
| Concurrency (double-pay, lost updates) | ✅ Holds under 5,000-way races |
| Referral code generation under load | ✅ 1,000 concurrent signups, 0 collisions |
| RLS coverage | ✅ All 24 tables, all with policies |
| **Write authorization (money)** | ❌ **Critical — ambassadors can set their own payout** |
| **Survey response dedupe** | ❌ **Critical — unlimited point minting** |
| **Read paths past 1,000 rows** | ❌ **Critical — silent truncation / hard failure** |
| Rate limiting | ❌ Ineffective on serverless (per-instance) |
| Security headers | ❌ No CSP, no HSTS |

---

## 1. What was tested empirically

### 1.1 End-to-end lifecycle (surveys → campaigns → admin approve/reject)

Driven at scale, writing the *same* ledger rows the real server actions write
(verified against `approveSubmission` / `rejectSubmission` / `revokeSubmission`
and the public survey submit action).

| Stage | Volume | Points |
|---|---|---|
| Survey responses | 6,000 (30,000 answers) | +10 each → **60,000** |
| Campaign submissions | 20,000 → review queue | 0 (pending) |
| Admin **approve** | 14,000 | +10 each → **140,000** |
| Admin **reject** | 4,000 | **0** — correct, pending was never paid |
| Admin **revoke** | 1,000 | −10 each → **−10,000** |
| Referrals counted / voided | 2,700 / 300 | +100 / −100 → **270,000** |
| Left pending | 2,000 | — |

**Integrity invariants — all held:**

| Check | Expected | Actual |
|---|---|---|
| Ledger rows for rejected submissions | 0 | **0** ✅ |
| Net points for revoked submissions | 0 | **0** ✅ |
| Duplicate credits (same source+direction) | 0 | **0** ✅ |
| Ambassadors credited | 1,000 | **1,000** ✅ |

**Analytics reconciled exactly** (read from the live admin UI):
Points issued **500,000** = 60k + 140k + 300k. Reversed **40,000** = 10k + 30k.
By source: Referrals 300k · Campaigns 140k · Surveys 60k. ✅

### 1.2 Concurrency

| Test | Result |
|---|---|
| 5,000 concurrent clicks on ONE survey link | recorded **exactly 5,000, zero lost** ✅ |
| 100 concurrent identical approvals, one submission | **1 landed, 99 rejected as duplicate** ✅ |
| 1,000 concurrent signups | 1,000 created, **0 duplicate referral codes** ✅ |

The `point_ledger_source_direction_key` partial unique index (on
`source_type, source_id, direction`, where `direction` is a generated
`sign(delta)` column) genuinely prevents double-pay. Confirmed by race, not by
reading the comment.

Note: a single hot link's counter serialises on the row lock (~52 writes/s to
one row). The app's coalescing collapses a burst into a few `amount=N` writes,
so this is not a production bottleneck — but it is a real ceiling for one link.

### 1.3 Crowd / HTTP load

- Sustained **2,163 req/s**, 28,953 requests.
- Then **Vercel's edge DDoS protection engaged** — 403s, then dropped TLS
  handshakes from this address for ~30 minutes.
- A faithful 10,000-distinct-user test needs a distributed harness (k6/Locust
  across many source IPs); a single machine trips edge protection first.
  **That ceiling is itself the production finding.**

---

## 2. Critical findings

### 🔴 C1 — Ambassadors can set their own payout amount (money loss)

**VERIFIED HERE** — code + RLS policy + full attack chain.

The RLS insert policy on `redemption_requests` is:

```sql
with_check: ((ambassador_id = auth.uid()) AND (status = 'requested'))
```

It constrains `ambassador_id` and `status` — **not `points`, not `amount_inr`**.
The server action (`requestRedemption`, `src/lib/rewards-actions.ts:83`)
computes `amount_inr = floor(points / rate)` correctly, but it writes through
the **user's** client. An ambassador simply skips the app and POSTs directly to
`/rest/v1/redemption_requests`.

**Attack chain, verified end to end:**

1. Earn 500 points legitimately (the minimum redemption).
2. POST `{ambassador_id: <self>, status: "requested", points: 500, amount_inr: 500000, ...}`.
3. RLS permits it — neither field is checked.
4. `decideRedemption` (`src/lib/admin/money-actions.ts:56`) re-checks
   `balance >= request.points` — 500 points is real, so it **passes** — burns
   500 points, and **never recomputes `amount_inr`**.
5. `buildPayoutBatch` (`money-actions.ts:199,236`) copies `amount_inr` straight
   into `payouts.amount_inr` — what finance pays.

**Result:** ₹50 of points becomes a **₹500,000 payout**. 10,000× overpayment.

**Fix:** derive `amount_inr` server-side at approval time from `points` and the
`points_per_rupee` setting; never trust the stored value. Add a DB `CHECK`
or a `BEFORE INSERT` trigger pinning `amount_inr = floor(points / rate)`, and
tighten the RLS `with_check` to include it.

### 🔴 C2 — Unlimited, unauthenticated point minting on public surveys

**VERIFIED HERE** — index definitions + submit path.

Response dedupe relies entirely on two partial unique indexes:

```sql
survey_responses_one_email_per_survey ... WHERE status='valid' AND respondent_email IS NOT NULL
survey_responses_one_phone_per_survey ... WHERE status='valid' AND respondent_phone IS NOT NULL
```

`surveys.require_email` and `require_phone` are both admin-settable to **false**.
When they are, a respondent submits with both blank, **neither partial index
applies**, and every submission is a fresh `valid` row that mints
`+points_per_response` to the ambassador (`src/app/s/[slug]/actions.ts:211`).

No account needed. No rate limit that survives (see H1). A script on one public
URL mints unlimited points, which convert to stipend and cash.

`ip_hash` **is** computed, stored, and even indexed
(`survey_responses_ip_idx`) — but never read for dedupe.

**Fix:** enforce a per-(survey, ip_hash) window in the insert path (the index
already exists), and/or make dedupe independent of optional PII. Also enforce
`surveys.response_cap`, which is stored and displayed but never checked.

### 🔴 C3 — Survey response page fails completely past ~400 responses

**VERIFIED HERE** — reproduced live.

`getSurveyResponses` (`src/lib/admin/queries.ts:580`) fetches answers with
`.in("response_id", ids)`. With 422 responses that is a **15,613-character URL**
→ the request is refused → `fetch failed` → `data: null` → **the error is
discarded** (only `data` is destructured) → every answer disappears.

Reproduced on STRESS Survey 8 (422 responses / 2,110 answers): the page renders
**"422 responses"** in the header while every question reads
**"Nobody has answered this one yet."**

This breaks both the charts and the response table at a scale you will hit
immediately (target: 10 responses × 1,000 ambassadors per survey).

**Fix:** filter by the parent instead of an id list —
`.select("...,survey_responses!inner(survey_id)").eq("survey_responses.survey_id", id)`
— and page it. Never discard the PostgREST `error`.

**Class of bug:** three `.in()` sites carry unbounded UUID arrays —
`queries.ts:580` (broken), `money.ts:209` (bounded to 200 ≈ 7.4 KB, marginal),
`actions.ts:730` (unbounded on large referral voids).

### 🔴 C4 — Every read path silently truncated at 1,000 rows *(fixed this session)*

PostgREST caps a select at 1,000 rows with no error. Every admin aggregate was
written as an unbounded `select()`. The programme targets **10,000 downloads**
and `referral_conversions` gets a row per install — the goal tracker would have
frozen at 1,000 and reported 10% forever.

**Fixed** (commit `ea96d1e`) with a paging `readAll()` helper across 42 call
sites, re-validated against 24,301 live ledger rows.

**But the fix has its own ceilings** (see C5/H2) — it is correct, not fast.

### 🔴 C5 — `readAll` uses OFFSET paging: O(n²) and truncates at 1,000,000

**VERIFIED HERE** — `EXPLAIN ANALYZE` on the live table.

To return the last 1,000 of 24,301 ledger rows, Postgres **scanned 24,000 rows**
(517 buffers) — it walks and discards everything before the offset. At 5M rows
the final page walks 5M rows and the loop is quadratic.

Keyset paging is a pure index seek: `Index Cond: (id > X)`, 1,000 rows, 134
buffers. **Confirmed as the fix.**

Separately, `read-all.ts:36` hard-stops at `MAX = 1_000_000` — at 2M ledger rows
every balance is computed from half the ledger and shown as authoritative
(loud in server logs, silent in the UI).

### 🔴 C6 — Signup trigger trusts client-supplied `role` → self-provisioned admin

**VERIFIED HERE** — function body read from the live DB.

`handle_new_user()` (`supabase/migrations/0001_identity.sql`) writes the new
profile with:

```sql
role   := coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'ambassador')
status := case when encrypted_password is not null then 'active' else 'invited' end
```

`raw_user_meta_data` is **client-supplied at signup**. The app has no signup UI
and never calls `signUp()`, so this is contained *only if Supabase's project-level
signup endpoint is disabled*. If `/auth/v1/signup` is enabled, an anonymous
attacker POSTs `{email, password, data:{role:"admin"}}` and is auto-provisioned
as an **active admin** — full unauthenticated takeover of the whole console.

Not tested by actually creating an admin (correctly out of bounds). **Two fixes,
both unconditional:** (1) hard-code `role := 'ambassador'` in the trigger and
never read it from metadata; (2) confirm "Allow new users to sign up" is **off**
in Supabase Auth settings.

### 🔴 C7 — Password-reset link origin from attacker-controlled `X-Forwarded-Host`

**Audit-reported (two dimensions), consistent with the code.**

`src/lib/site-url.ts` builds the reset-link origin from a request header an
attacker controls. A poisoned `Host`/`X-Forwarded-Host` on a reset request makes
Supabase email a reset link pointing at the attacker's domain; the victim clicks,
the token lands on the attacker → **account takeover**, admins included.

**Fix:** build the origin from a server-side allowlist / `NEXT_PUBLIC_SITE_URL`
env, never from request headers.

---

## 3. High findings (audit-reported, verification in progress)

### Security

| # | Finding | File |
|---|---|---|
| H1 | Rate limiter is an in-memory `Map`; on serverless the real limit is `configured × instances` — `/login` at 240/min becomes ~48,000/min across 200 isolates, and per-isolate never trips | `src/lib/rate-limit.ts` |
| H2 | Rate-limit bucket key is the **client-controlled** leftmost `X-Forwarded-For` — trivially rotated | `src/proxy.ts` |
| H3 | Rate limits key on URL **path prefix**, but Server Actions all POST to the same page path — the action layer is unthrottled | `src/proxy.ts` |
| H4 | Password-reset link origin taken from the attacker-controlled `X-Forwarded-Host` header → reset-link poisoning / account takeover | reset flow |
| H5 | Web Push endpoint stored and requested with no validation → **SSRF** | `src/lib/notifications.ts` |
| H6 | No HSTS; Supabase session cookie set without `Secure` | `next.config` / proxy |
| H7 | `surveys.response_cap` is admin-settable and displayed as a limit but **never enforced** | survey submit |
| H8 | Perceptual-duplicate screenshot check **excludes the uploader's own submissions** — a student can reuse one screenshot across tasks | `src/lib/submissions/actions.ts` |
| H9 | Voiding a referral reverses the flat points but **not** the tier-multiplier bonus | `src/lib/admin/actions.ts` |
| H10 | `payouts_one_stipend_per_month` is keyed on batch, so it does **not** enforce one stipend per month | migration |
| H11 | `decideRedemption` re-checks balance then writes the burn in a **separate statement** — concurrent approvals can overdraw | `money-actions.ts:56` |
| H12 | Referral codes are sequential and enumerable; `/r/[code]` turns each guess into a tracked click | `referral-code-shape.ts` |
| H13 | `next@16.2.12` bundles nested deps with three open high-severity advisories (incl. `sharp 0.34.5`) | `package.json` |

### Scale (12-dimension audit — 80 findings: 13 critical, 36 high)

Grouped by root cause:

| Theme | Findings | Core problem |
|---|---|---|
| Aggregation in JS not SQL | 23 | Whole tables streamed to Node to compute `SUM`/`GROUP BY` |
| `readAll` paging / truncation | 11 | OFFSET quadratic + 1M cap |
| Caching | 10 | Admin pages fully uncached; leaderboard recomputed per request |
| UI truncation / unbounded lists | 6 | Ambassadors page renders all 10k rows; leaderboard capped at 500 silently |
| Indexes | 3 | Schema is **well indexed** — this was largely a clean bill |
| Click counter hot row | 3 | Single-row write ceiling for a viral link |
| Connection pool | 2 | All 10k requests funnel into PostgREST's fixed pool on a 60-connection instance |

**The single worst scale item:** `/admin/analytics` performs **14 full
`point_ledger` reads** per render across its 9 data getters (42 `readAll` call
sites total). At 5M ledger rows that is ~35,000 sequential round trips and
tens of millions of row objects in a serverless function — it OOMs or hits
`FUNCTION_INVOCATION_TIMEOUT` long before rendering.

Notably, **connection blow-out is avoided by design** — Supabase's PostgREST
pool means 10k concurrent requests do *not* become 10k Postgres connections.
The ceiling is PostgREST's pool, not the classic serverless failure.

---

## 4. Confirmed non-issues

Worth recording so they are not re-investigated:

- **RLS**: enabled on all 24 public tables, every one with policies.
- **No secrets committed**: `.env*` is gitignored; the tracked `.env.example`
  has **empty** values for every secret.
- **`stipend_eligibility`** — Supabase's linter flags it as callable by
  `authenticated`, but it **has an internal `is_admin()` guard** and a pinned
  `search_path`. False positive.
- **Ledger append-only triggers** work (`point_ledger_no_delete` /
  `no_update`); they had to be explicitly disabled for teardown.
- **Idempotency of approvals** — proven by a 100-way race, not assumed.
- **Database indexing** — the schema is well indexed on the hot paths; the
  index-audit dimension returned mostly LOW/INFO.

Supabase advisor also flags: `window_start` has a mutable `search_path`
(genuine, low), and **leaked-password protection is disabled** (genuine,
one toggle).

---

## 4b. What was fixed (this session)

| # | Fix | Where | Proof |
|---|---|---|---|
| **C1** | `amount_inr` is now derived in the **database** from `points` × rate for any non-admin writer, and the approval **refuses** a request whose amount disagrees | migration `0025`, `money-actions.ts` | Simulated the attack as an authenticated ambassador: a forged **₹500,000** claim was rewritten to **₹50** ✅ |
| **C2** | Per-`(survey, ip_hash)` 30-minute window — a repeat is recorded but **not paid for**; `surveys.response_cap` is now actually enforced | `s/[slug]/actions.ts`, migration `0025` | Dedupe no longer depends on optional email/phone |
| **C3** | Answers filtered through the parent (`survey_responses!inner`) and paged, instead of a 422-uuid `.in()` | `queries.ts` | Page that showed *"422 responses / nobody answered"* now renders real charts: **117+109+102+94 = 422** ✅ |
| **C4** | 1,000-row truncation | `read-all.ts` (earlier commit) | Re-validated at 24,301 ledger rows |
| **C5** | `readAll` no longer fails silently — a failed page or an over-cap read now **throws** instead of returning a wrong total | `read-all.ts` | Silent-wrong-number class eliminated |
| **C6** | Signup trigger ignores client metadata; `role` is hard-coded `'ambassador'` | migration `0025` | Verified live: *"role hard-coded OK"* ✅ |
| **C7** | Reset-link origin comes from env / Vercel platform vars, with a **host allowlist**; unknown hosts fall back instead of being echoed | `site-url.ts` | Host-poisoning path closed |
| **H2** | Rate-limit key now reads the **rightmost** (proxy-appended) forwarded-for entry and prefers `x-vercel-forwarded-for` | `proxy.ts` | Client can no longer rotate its own bucket |
| **Headers** | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy; `X-Powered-By` removed | `next.config.ts` | All six served; **0 CSP violations** on the admin app ✅ |

### Second round (after the full audit returned)

The audits finished with **51 verified security findings** (46 confirmed, 4
plausible, 1 refuted) and **80 scale findings**. These were fixed on top of the
list above:

| Fix | Where | Proof |
|---|---|---|
| **One screenshot no longer clears every task.** The perceptual-duplicate check excluded *all* of the uploader's own submissions — aimed at the retry case, but it meant one image auto-approved like, comment, share and story. Retries are already handled per-task upstream, so the exemption now covers only the **same task**. | `submissions/actions.ts` | The check that exists to catch a reused picture is no longer blind to the easiest way to reuse one |
| **Open redirect on login.** `startsWith("/") && !startsWith("//")` misses `/\evil.example` — browsers read `\` as `/`, so it resolves to `//evil.example`, on the page users land on holding a fresh session. Replaced with an explicit `isLocalPath()` (no regex — the backslash escaping is exactly what silently compiles to the wrong thing). | `login/actions.ts` | 11-case table incl. backslash, control chars, whitespace — all pass ✅ |
| **Cohort keys were self-writable.** The profiles guard pinned role/status/email but predated `city`, `batch`, `college`. Those are what `batch_standings` and every cohort breakdown group by — an ambassador could move into whichever batch they were likeliest to top. Now pinned, along with the suspension bookkeeping. | migration `0026` | Tested as a real non-admin: batch/college/role changes **blocked**, legitimate rename **allowed** ✅ |
| **Notifications were rewritable by their recipient.** The policy checked `profile_id` and nothing else; the app only ever writes `read_at`. Now only `read_at` may change. | migration `0026` | Trigger enforced |
| **`window_start` mutable `search_path`** (called inside two SECURITY DEFINER functions) and **`active_days` policy written for `public`** (predicate saved it, role grant shouldn't rely on that). | migration `0026` | Both tightened |

**Still open** — deliberately, and none of it exploitable:

- **The scale refactor.** Admin aggregation still streams rows via `readAll`.
  The synthesis puts numbers on it: `/admin/analytics` reads `point_ledger`
  **7–8 times per render** across ~29 paginations; at 2M rows that is ~7,000
  sequential round trips with quadratic offset cost, and the page times out
  well before 10k concurrency. The fix is one aggregate RPC per subject area
  (`sum(delta) group by ambassador_id`), returning thousands of rows instead of
  millions. `readAll` now *throws* rather than returning a half-ledger total,
  so the failure mode is loud instead of silently wrong.
- **Shared-store rate limiter.** Still in-memory, so still per-instance. The
  client-controlled-IP half is fixed; the cross-instance bound needs Upstash/KV.
- **Assorted mediums** from the audit: referral multiplier not clawed back on a
  downgrade, `payouts_one_stipend_per_month` keyed on batch so it doesn't
  enforce, `decideRedemption` check-then-write race, failed payouts destroying
  points with no reversal path, push-endpoint SSRF validation, session cookie
  `HttpOnly`/`Secure` flags. All are in §3 with file references.

## 5. Suggested fix order

1. **C1** — payout amount authorization. Money leaves the building.
2. **C2** — survey response dedupe. Free points convert to cash.
3. **C3** — survey response page `.in()` failure. Broken at your target scale.
4. **H1–H3** — shared-store rate limiter + trusted client IP + action-layer throttling.
5. **H4** — reset-link host poisoning (account takeover).
6. **C5 / scale** — replace `readAll` aggregation with SQL aggregate RPCs;
   switch any remaining raw reads to keyset paging.
7. **H6, headers** — CSP, HSTS, `Secure` cookie.

---

## 6. Test assets

| File | Purpose |
|---|---|
| `scripts/stress-1000.mts` | 1,000-ambassador signup storm, crowd, click storm; `--cleanup` removes accounts |
| `scripts/stress-concurrency.mts` | Click-storm + double-approve race integrity tests |
| `scripts/stress-seed.sql` | ~5M-row mechanism-accurate volume seed (not run — blocked as a large production write) |
| `scripts/stress-teardown.sql` | Removes every `STRESS`-tagged row |

**Current DB state:** 1,000 seeded ambassadors · 6,000 responses · 30,000
answers · 20,000 submissions · 3,000 conversions · 24,301 ledger rows ·
15,001 links — all `STRESS`-tagged and removable with the teardown script.
