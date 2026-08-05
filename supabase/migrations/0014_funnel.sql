-- ============================================================================
-- 0014 — The download funnel
-- ============================================================================
-- The programme's success metric is a hard number (10,000 downloads), so the
-- admin needs a funnel and a velocity, not a running total. This migration
-- gives the existing data the shape to answer that.
--
-- Crucially it does NOT change how downloads get recorded. They are typed in
-- by an admin, by request, and `setReferralCount` already writes one
-- `referral_conversions` row per download — so per-install rows already exist
-- and the funnel can hang off them without anyone importing anything new.
--
-- The stages after "installed" work the same way: an admin says how many of
-- someone's downloads reached each stage, and the action stamps that many
-- rows. Same idea as the download count, one level deeper.
-- ============================================================================

create type public.install_store as enum ('play_store', 'app_store', 'unknown');

alter table public.referral_conversions
  add column if not exists store public.install_store not null default 'unknown',
  add column if not exists onboarded_at   timestamptz,
  add column if not exists activated_at   timestamptz,
  add column if not exists day3_return_at timestamptz,
  add column if not exists day7_return_at timestamptz;

create index if not exists referral_conversions_store_idx
  on public.referral_conversions (store) where status = 'counted';

create index if not exists referral_conversions_converted_idx
  on public.referral_conversions (converted_at) where status = 'counted';

-- ─── Referral link clicks ───────────────────────────────────────────────────
-- The first stage of the funnel had no data at all, because nothing we own sat
-- between the student sharing a link and the store opening. `/r/[code]` is
-- that thing: it records the click and redirects to the right store.
--
-- One row per click rather than a counter, so clicks can be charted per day
-- and the click-to-install rate has a denominator with a date on it.

create table public.referral_clicks (
  id            uuid primary key default gen_random_uuid(),
  ambassador_id uuid        references public.profiles (id) on delete cascade,
  code          text        not null,
  store         public.install_store not null default 'unknown',
  ip_hash       text,
  user_agent    text,
  clicked_at    timestamptz not null default now()
);

create index referral_clicks_ambassador_idx on public.referral_clicks (ambassador_id, clicked_at desc);
create index referral_clicks_day_idx on public.referral_clicks (clicked_at);

alter table public.referral_clicks enable row level security;

-- Students see their own click count; admins see everything. Inserts come from
-- server code holding the service-role key, exactly like the ledger, so a
-- client cannot inflate anyone's clicks.
create policy referral_clicks_select_own on public.referral_clicks
  for select to authenticated
  using (ambassador_id = auth.uid());

create policy referral_clicks_select_admin on public.referral_clicks
  for select to authenticated
  using (public.is_admin());

-- ─── Store links ────────────────────────────────────────────────────────────

insert into public.app_settings (key, value, description)
values
  ('play_store_url', '"https://play.google.com/store/apps/details?id=com.dailymattr"'::jsonb,
   'Where /r/[code] sends Android traffic.'),
  ('app_store_url', '"https://apps.apple.com/app/dailymattr"'::jsonb,
   'Where /r/[code] sends iOS traffic.')
on conflict (key) do nothing;
