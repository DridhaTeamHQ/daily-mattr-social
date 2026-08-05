-- ============================================================================
-- 0016 — Badges, response caps, campaign archiving
-- ============================================================================
-- The gamification layer from 9.3, plus two small management gaps from 9.1.
--
-- Badges are stored as rows with a `criteria` blob rather than hard-coded in
-- the app, so a new badge is an insert. The criteria are read and evaluated in
-- TypeScript, deliberately: a rules engine expressed in SQL would be clever
-- and unreadable, and these rules ("25 valid responses", "one approved task on
-- every platform") are ordinary code.
--
-- `archived` joins the campaign status enum so a finished campaign can be put
-- away without being deleted — 'ended' means the deadline passed, 'archived'
-- means stop showing it to me.
-- ============================================================================

alter type public.campaign_status add value if not exists 'archived';

alter table public.surveys
  add column if not exists response_cap integer
    check (response_cap is null or response_cap > 0);

-- ─── Badges ─────────────────────────────────────────────────────────────────

create table public.badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text        not null unique,
  label       text        not null,
  description text        not null,
  icon        text        not null default 'award',
  tone        text        not null default 'brand',
  criteria    jsonb       not null,
  active      boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);

create table public.badge_awards (
  id            uuid primary key default gen_random_uuid(),
  badge_id      uuid        not null references public.badges (id) on delete cascade,
  ambassador_id uuid        not null references public.profiles (id) on delete cascade,
  awarded_at    timestamptz not null default now(),
  meta          jsonb       not null default '{}'::jsonb,
  -- Earning a badge twice is not a thing. The unique index is what makes the
  -- award pass safely re-runnable.
  unique (badge_id, ambassador_id)
);

create index badge_awards_ambassador_idx
  on public.badge_awards (ambassador_id, awarded_at desc);

insert into public.badges (slug, label, description, icon, tone, criteria, sort_order)
values
  ('survey_champion',   'Survey Champion',  'Collected 25 valid survey responses.',              'clipboard-check',    'poll',   '{"kind":"survey_responses","min":25}'::jsonb,     10),
  ('top_referrer',      'Top Referrer',     'Drove 25 confirmed app downloads.',                 'gift',               'invite', '{"kind":"downloads","min":25}'::jsonb,            20),
  ('platform_explorer', 'Platform Explorer','Completed an approved task on every active platform.','compass',          'reel',   '{"kind":"platform_sweep"}'::jsonb,                30),
  ('first_blood',       'Off the Mark',     'Got your first submission approved.',               'zap',                'brand',  '{"kind":"approved_submissions","min":1}'::jsonb,   5),
  ('streak_3',          'Three in a Row',   'Active three weeks running.',                       'flame',              'rank',   '{"kind":"streak_weeks","min":3}'::jsonb,          40),
  ('stipend_earner',    'Stipend Earner',   'Met the monthly stipend threshold.',                'badge-indian-rupee', 'brand',  '{"kind":"stipend_months","min":1}'::jsonb,        50)
on conflict (slug) do nothing;

-- ─── Enhancement settings ───────────────────────────────────────────────────

insert into public.app_settings (key, value, description)
values
  ('streak_bonus_weeks',            '3'::jsonb,    'Consecutive active weeks that earn the consistency bonus.'),
  ('streak_bonus_points',           '100'::jsonb,  'Points awarded when the streak bonus is reached.'),
  ('referral_multiplier_threshold', '25'::jsonb,   'Confirmed downloads after which referral points are multiplied.'),
  ('referral_multiplier',           '1.2'::jsonb,  'Multiplier applied to referral points past the threshold.'),
  ('public_stats_enabled',          'true'::jsonb, 'Whether the public transparency page is reachable.')
on conflict (key) do nothing;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Both tables are readable by every signed-in user: a badge is a public honour,
-- and the profile page shows other people's. Only admins write.

alter table public.badges       enable row level security;
alter table public.badge_awards enable row level security;

create policy badges_select_all on public.badges
  for select to authenticated using (true);

create policy badges_all_admin on public.badges
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy badge_awards_select_all on public.badge_awards
  for select to authenticated using (true);

create policy badge_awards_all_admin on public.badge_awards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
