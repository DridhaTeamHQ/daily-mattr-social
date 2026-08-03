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

- **Database schema** — seven migrations, RLS on every table.
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
  - `0007_harden_functions` — revokes the default PUBLIC execute grant and
    pins search_path. Postgres grants EXECUTE to PUBLIC on every new function,
    so the earlier `revoke ... from anon, authenticated` lines were no-ops:
    anonymous callers could reach `ensure_survey_links` and
    `ambassador_points` over the REST API.

- **Design system** — `src/app/globals.css`. Light-only tokens: warm off-white
  canvas, indigo brand, four section accents, semantic colours reserved for
  status.
- **UI primitives** — `button`, `card`, `badge`, `input`, `stat`, `feedback`.
- **Root layout** — Inter, sonner `<Toaster>`, metadata template.
- **Env contract** — `.env.example` documents every variable.
- **Env access** — `src/lib/env.ts`. `NEXT_PUBLIC_*` read as literal
  `process.env.X` so Next inlines them; server-only values gated behind
  `serverEnv()`.
- **Database types** — `src/lib/database.types.ts`, hand-written to match the
  migrations in the shape postgrest-js requires (`Row`/`Insert`/`Update`/
  `Relationships`). Append-only tables use `Update: NoUpdate`, so
  `.update()` on `point_ledger` or `audit_log` fails to compile. Regenerate
  with `npx supabase gen types typescript --project-id hqxcinryuiatbybbsrkn`.
- **Supabase clients** — `src/lib/supabase/{client,server,admin}.ts`.
  `server.ts` is async (`cookies()` is async in Next 16) and exposes
  `getUser()` / `getProfile()`. `admin.ts` is `server-only` and is the sole
  reader of the service-role key.
- **Session refresh** — `src/proxy.ts`. Next.js 16 renamed Middleware to
  **Proxy**; the file must be `proxy.ts`, not `middleware.ts`.

- **Live Supabase project** — `daily-mattr-social` (`hqxcinryuiatbybbsrkn`,
  ap-south-1). All seven migrations applied; 14 tables, RLS on every one.
- **Demo mode** — retained as the no-config fallback. When the Supabase env
  vars are empty, `proxy.ts` passes requests through and `lib/queries.ts` serves
  fixtures with a banner. Pages never touch a Supabase client directly.
- **Auth** — email + password. `login/actions.ts` holds `signIn` / `signOut`;
  the login page is a two-panel gradient layout. Sign-out lives in the nav.
- **Seed** — `npm run seed` creates an admin, six ambassadors, three campaigns,
  a live survey with links, a points ledger and referral conversions.
  Idempotent; `npm run seed -- --clean` removes it all.
- **Ambassador screens** — dashboard, campaigns, surveys, referrals,
  leaderboard, all on live data. Mobile-first.
- **Colour system** — one accent per section (campaigns pink, surveys teal,
  referrals orange, leaderboard violet), carried by the nav, page headers and
  stat chips so colour signals location. Status colours stay reserved.
- **Admin section** — overview, review queue (signed-URL screenshots,
  pass/fail checks, approve / reject / revoke), campaigns, surveys,
  ambassadors. Toast feedback on every mutation.
- **Notifications** — 0008 adds `notifications` + `push_subscriptions`.
  In-app bell with unread count, Web Push over VAPID with a service worker,
  confetti on an unopened approval, and `my_streak()` behind the flame.
- **Student UI** — rebuilt bold and playful: violet base, fat radii, pressable
  buttons, count-up hero, tier track, progress bars.
- **Repo** — https://github.com/DridhaTeamHQ/daily-mattr-social
- **Deployed** — https://daily-mattr-social-mbge.vercel.app (Vercel, auto-deploys from `main`)

### Not started

- The public survey route `/s/[slug]`. The "Preview" button on the surveys
  page still 404s.
- **Screenshot upload** — the biggest remaining gap. The Upload buttons on
  campaigns are inert, so submissions can only be created by the seed script.
  `lib/images.ts` already does sha256 + dhash + EXIF, so the pipeline has its
  fingerprinting; what is missing is the route that accepts a file, runs the
  deterministic checks, calls `find_similar_submissions()`, and decides
  auto-approve vs. review.
- AI adjudication. `OPENAI_API_KEY` is set but nothing calls it yet.
- The survey builder, and CSV referral import.
- Password reset / invite acceptance.

## Remaining work, in order

0. ~~**Provision the database**~~ — done.
1. ~~**Supabase plumbing**~~ — done.
2. ~~**Auth**~~ — done, except role-based redirect and suspended-user
   handling, which wait on the admin section.
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

## Gotchas found the hard way

- **`position` is a reserved word.** `returns table (position bigint, ...)` is
  a syntax error; it must be quoted, and a CTE cannot alias to it either.
  Migration 0002 carried this bug until it was first run.
- **Postgres grants EXECUTE to PUBLIC.** Revoking from `anon` and
  `authenticated` leaves the PUBLIC grant intact. See 0007.
- **Next.js 16 renamed Middleware to Proxy.** `middleware.ts` is ignored.
- **`lucide-react` v1 removed brand icons** — there is no `Instagram` export.
- **postgrest-js needs a single string literal in `.select()`.** Building the
  argument with `+` degrades every row type to `GenericStringError`.
- **Grid `min-h-dvh` does not stretch an implicit `auto` row** — panels stop
  short of the viewport unless the row is explicitly `1fr`.
- **The React Compiler lint forbids `setState` in an effect body.** External
  state (push permission) belongs in `useSyncExternalStore`; prop-driven resets
  belong in a render-phase adjustment.
- **Instagram screenshots are mostly identical chrome.** Two legitimately
  different screenshots can sit within a dhash distance of 6, so
  `phash.reject_distance` is a flag-for-review threshold, not an auto-reject
  one.
