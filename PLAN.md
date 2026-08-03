# DailyMattr Socials — build plan

Student ambassador platform. Ambassadors run surveys, complete Instagram tasks,
and refer app downloads; everything converts to points on a leaderboard. Admins
create the work and review the evidence.

Stack: Next.js 16.2.12 (App Router, React 19.2, React Compiler), Tailwind v4,
Supabase (Postgres + Auth + Storage), OpenAI vision for screenshot adjudication.

> Next.js 16 has breaking changes vs. training data. Read
> `node_modules/next/dist/docs/` before writing framework code. See `AGENTS.md`.

---

## Status

### Done

- **Database schema** — six migrations, RLS on every table.
  - `0001_identity` — `profiles`, `app_settings`, `audit_log`, `is_admin()`,
    `is_active_ambassador()`, referral-code generation, `handle_new_user()`
    trigger on `auth.users`, privilege-column guard.
  - `0002_points` — `point_ledger`, append-only (update/delete blocked by
    trigger; corrections are compensating rows). `ambassador_points()`,
    `leaderboard()`, `my_standing()`. Unique index on
    `(source_type, source_id, direction)` makes crediting idempotent.
  - `0003_survey` — `surveys`, `survey_questions`, `survey_links` (one slug per
    ambassador per survey), `survey_responses`, `survey_answers`.
    `ensure_survey_links()`, `my_survey_stats()`. Dedup by email/phone per
    survey via partial unique indexes on valid rows.
  - `0004_campaigns` — `campaigns`, `campaign_tasks`, `submissions` with
    perceptual hash (`phash bit(64)`) and `find_similar_submissions()` for
    screenshot reuse detection. Deterministic `checks` + `ai_verdict` columns.
  - `0005_referrals` — `referral_imports`, `referral_conversions`, idempotent on
    `(code, external_user_ref)`. `my_referral_stats()`.
  - `0006_storage` — private `screenshots` bucket (10 MB, keys are
    `<ambassador_id>/<task_id>/<uuid>.<ext>`), public `campaign-media` (5 MB).

- **Design system** — `src/app/globals.css`. Light-only tokens: warm off-white
  canvas, single muted indigo brand, semantic colours reserved for status.
- **UI primitives** — `button`, `card`, `badge`, `input`, `stat`, `feedback`.
- **Root layout** — Inter, sonner `<Toaster>`, metadata template.
- **Env contract** — `.env.example` documents every variable.
- **Env access** — `src/lib/env.ts`. `NEXT_PUBLIC_*` read as literal
  `process.env.X` so Next inlines them; server-only values gated behind
  `serverEnv()`.
- **Database types** — `src/lib/database.types.ts`, hand-written to match the
  migrations in the shape postgrest-js requires (`Row`/`Insert`/`Update`/
  `Relationships`). Append-only tables use `Update: NoUpdate`, so
  `.update()` on `point_ledger` or `audit_log` fails to compile. Replace with
  `supabase gen types` output once the project exists.
- **Supabase clients** — `src/lib/supabase/{client,server,admin}.ts`.
  `server.ts` is async (`cookies()` is async in Next 16) and exposes
  `getUser()` / `getProfile()`. `admin.ts` is `server-only` and is the sole
  reader of the service-role key.
- **Session refresh** — `src/proxy.ts`. Next.js 16 renamed Middleware to
  **Proxy**; the file must be `proxy.ts`, not `middleware.ts`.

- **Demo mode** — with no Supabase project configured, `isSupabaseConfigured()`
  is false: `proxy.ts` passes every request through, `lib/queries.ts` serves
  fixtures from `lib/demo-data.ts`, and every screen carries a "Demo data"
  banner. Filling the three Supabase values in `.env.local` switches it off.
  Pages never touch a Supabase client directly — they read through
  `lib/queries.ts`, so going live is a change to that one module.
- **Ambassador screens** — dashboard, campaigns, surveys, referrals,
  leaderboard, plus a placeholder `/login`. Mobile-first: bottom tab bar under
  `sm`, top nav above it.
- **Repo** — https://github.com/DridhaTeamHQ/daily-mattr-social

### Not started

- Auth: login page is a placeholder — no action, no callback, no sign-out.
- The public survey route `/s/[slug]`. The "Preview" button on the surveys
  page currently 404s.
- Screenshot upload. The Upload buttons on campaigns are inert.
- The whole `/admin` section.

> **Unverified:** the live-data branches in `lib/queries.ts` are written but
> have never run against a real database — there isn't one yet. Re-check them
> against actual results once the project is provisioned.
- `scripts/seed.ts` — referenced by `npm run seed`, file does not exist.
- Deterministic screenshot checks + OpenAI adjudication pipeline.
- CSV referral import.

---

## Remaining work, in order

0. **Provision the database.** Blocking everything below. There is no Supabase
   project for this app yet and all three Supabase vars in `.env.local` are
   empty. Note the account's existing **DailyMattr CMS** project
   (`ijnlvyctwgdvsedpejva`) belongs to a *different* app — a content CMS with
   live data and its own `public.audit_log` — so `0001` must not be applied
   there. Docker is not installed, so `supabase start` is unavailable.
1. ~~**Supabase plumbing**~~ — done.
2. **Auth** — `/login`, role-based redirect (admin → `/admin`, ambassador →
   `/dashboard`), suspended-user handling. Session refresh already lives in
   `src/proxy.ts`.
3. **Ambassador shell** — nav, `/dashboard` with points, standing, and open work.
4. **Surveys, ambassador side** — `/dashboard/surveys` listing links + stats;
   copy-link and QR (`qrcode` is already a dependency).
5. **Public survey** — `/s/[slug]`, unauthenticated. Renders questions by type,
   validates with zod, hashes IP with `IP_HASH_SALT`, dedups, writes the
   response, credits the ledger. Increments `click_count` on view.
6. **Campaigns, ambassador side** — `/dashboard/campaigns`, task list, upload.
7. **Submission pipeline** — on upload: read EXIF (`exifr`), normalise with
   `sharp`, compute pHash, run deterministic checks, call
   `find_similar_submissions()`. If clean and confident → `auto_approved` +
   ledger credit. Otherwise → `needs_review`. No `OPENAI_API_KEY` means
   everything that passes deterministic checks goes to review instead.
8. **Referrals, ambassador side** — code display, QR, confirmed-conversion count.
9. **Leaderboard** — `/dashboard/leaderboard` off `leaderboard()`.
10. **Admin: campaigns** — CRUD, tasks, thumbnail upload, publish/end.
11. **Admin: review queue** — the core admin screen. Screenshot via signed URL,
    similar-submission panel, approve/reject with reason, ledger write.
12. **Admin: surveys** — builder, publish, `ensure_survey_links()`, response
    export.
13. **Admin: ambassadors** — invite, activate, suspend, manual point adjust.
14. **Admin: referral import** — CSV upload (`papaparse`), match codes, report
    unmatched, credit.
15. **Seed script** and a pass over `npm run lint` / `npm run typecheck`.

---

## Decisions already made (do not relitigate)

- **Points are a ledger, never a counter.** Balances are always
  `sum(delta)`. Reversals are new rows with `reason = 'revoke'`.
- **Crediting is idempotent** through `(source_type, source_id, direction)`.
  Write the credit with the source pair set; a retry is a no-op.
- **`is_admin()` is `SECURITY DEFINER`** deliberately — under the caller's RLS
  it would recurse on `profiles`.
- **Referral codes exclude ambiguous glyphs** (`0 O 1 I L U`). The alphabet in
  `src/lib/utils.ts` `randomCode()` mirrors `gen_referral_code()` in SQL.
- **Light mode only.** No dark mode.
- **Screenshots are private.** Serve through short-lived signed URLs.
- **AI is an accelerator, not a gate.** Without a key the app still works; it
  just stops auto-approving.

---

## Open questions

- Have the migrations been applied to the live Supabase project, or only
  written to disk?
- Is there an existing admin account, or does the first one need seeding?
