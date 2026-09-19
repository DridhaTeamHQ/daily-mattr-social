-- ─────────────────────────────────────────────────────────────────────────────
-- 0047 — Programme versions: V2 starts at zero, V1 stays exactly as it is
--
-- The programme is being run again from the beginning. Every counted thing —
-- campaigns, surveys, responses, submissions, installs, points, stipends —
-- starts at nought for the new run, and none of the first run's rows are
-- touched, moved or removed. V1 remains readable in full, for ever.
--
-- ─── Why a column and not a date ────────────────────────────────────────────
--
-- The obvious cheap answer is "V2 is everything after the cutover instant",
-- with no schema change at all. This repository has been bitten by exactly
-- that reasoning twice already. 0040 found a campaign's end being inferred
-- from `updated_at`, which any later edit moved, and charged five closed
-- campaigns to an ambassador who joined after they shut. 0044 found
-- `activated_at` reconstructed from surviving sessions and three ambassadors
-- measured against a month they had not served. Both fixes were the same
-- shape: stop inferring, stamp it, and stamp it from a trigger so no caller
-- can forget.
--
-- A date cutover would fail the same way the moment anything real happens —
-- a V1 install voided in V2's time, a V1 campaign still live on the day of
-- the switch, a correction back-dated by an admin. So the run a row belongs
-- to is written on the row, once, and never derived.
--
-- ─── What is versioned, and what deliberately is not ────────────────────────
--
-- Versioned — the things that produce numbers, and must therefore reset:
--   campaigns, surveys, submissions, survey_responses, referral_conversions,
--   referral_clicks, point_ledger, achievements, badge_awards,
--   redemption_requests, payout_batches, payouts.
--
-- Not versioned — identity and configuration, which carry across:
--   profiles          the same students, the same logins, the same codes
--   task_library      the bank campaigns are built from
--   badges            the definitions; the awards against them are versioned
--   app_settings      the thresholds, which are a decision, not a result
--   audit_log         one continuous record of what admins did
--   notifications, push_subscriptions
--   active_days       attendance is attendance; see my_streak below
--
-- `survey_links` and `campaign_tasks` carry no column of their own: each
-- belongs to exactly one survey or campaign and inherits that row's version,
-- so a second copy could only ever disagree with its parent.
--
-- ─── How a row lands in the right run ───────────────────────────────────────
--
-- `current_programme_version()` is the default on every versioned column, so
-- an ordinary insert needs no argument and no application change: a row is
-- born into whichever run is active when it is written. Submissions and
-- responses take theirs from their parent campaign or survey through a
-- trigger instead, so proof filed against a V1 campaign is V1 work whenever
-- it arrives.
--
-- The function refuses to return anything but a version that exists, and
-- falls back to 1 on a missing, malformed or unknown setting. It is in the
-- default of twelve tables; one bad row in app_settings must not be able to
-- stop the programme accepting writes.
--
-- ─── The switch ────────────────────────────────────────────────────────────
--
-- `active_programme_version` in app_settings, seeded to 1. This migration
-- creates V1, records every existing row as V1, and leaves V1 active. Moving
-- to V2 is a deliberate admin action on /admin, not something a deploy does
-- to a running programme.
--
-- ─── Two uniqueness rules that had to widen ────────────────────────────────
--
-- Both would have silently refused legitimate V2 rows:
--
--   point_ledger (source_type, source_id, direction) — the streak and
--   referral-multiplier bonuses build their source_id out of an ambassador id
--   and a count, so a three-week run in V2 collides with the same person's
--   three-week run in V1 and the bonus is never paid a second time.
--
--   referral_conversions (code, external_user_ref) — the pair that makes a
--   CSV re-import a no-op rather than a double payout. A genuinely new V2
--   install carrying a ref seen in V1 would be dropped as already imported.
--
--   badge_awards (badge_id, ambassador_id) — a badge is earned per run, so
--   V2 starts with none of them held.
--
-- ─── What my_streak still counts ───────────────────────────────────────────
--
-- Nothing here changes it, on purpose. A streak answers "did this person
-- turn up", which is not a score being reset — and its sturdiest source,
-- `active_days`, is unversioned for the same reason. Somebody who has opened
-- the app every morning has done that whichever run it is.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── The runs themselves ────────────────────────────────────────────────────

create table if not exists public.programme_versions (
  id          smallint    primary key,
  label       text        not null,
  description text,
  -- When this run opened. Null on a run that has never been made active.
  started_at  timestamptz,
  -- When the next run took over. Null on the run that is still current.
  ended_at    timestamptz,
  created_by  uuid        references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint programme_versions_id_sane    check (id between 1 and 999),
  constraint programme_versions_label_sane check (char_length(btrim(label)) between 1 and 40)
);

comment on table public.programme_versions is
  'One row per run of the ambassador programme. Every counted row carries the '
  'id of the run it belongs to, so a new run starts at zero without anything '
  'from an earlier one being moved or removed.';

-- V1 is everything that already exists. Its start is the day the first
-- profile was created, which is the earliest thing the programme knows about
-- itself; `coalesce` covers an empty database.
insert into public.programme_versions (id, label, description, started_at)
values (
  1,
  'V1',
  'The first run of the ambassador programme.',
  coalesce((select min(created_at) from public.profiles), now())
)
on conflict (id) do nothing;

insert into public.app_settings (key, value, description)
values (
  'active_programme_version',
  to_jsonb(1),
  'Which run of the programme new work belongs to. Every versioned row is '
  'born into this one. Changed from the Programme version card on /admin; a '
  'value naming no row in programme_versions falls back to 1.'
)
on conflict (key) do nothing;

-- ─── Which run is open ──────────────────────────────────────────────────────
--
-- plpgsql with its own exception block rather than a one-line sql function:
-- this is evaluated on every insert into twelve tables, and a setting that
-- someone typed as "two" must produce a fallback rather than an error that
-- stops the programme recording anything at all.

create or replace function public.current_programme_version()
returns smallint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  raw    text;
  parsed integer;
begin
  select value #>> '{}' into raw
  from public.app_settings
  where key = 'active_programme_version';

  if raw is null or btrim(raw) = '' then
    return 1;
  end if;

  begin
    parsed := btrim(raw)::integer;
  exception when others then
    return 1;
  end;

  -- A version nothing knows about is worse than the fallback: rows would be
  -- written into a run that no screen can select and no report can read.
  if parsed is null
     or not exists (select 1 from public.programme_versions where id = parsed)
  then
    return 1;
  end if;

  return parsed::smallint;
end;
$$;

comment on function public.current_programme_version() is
  'The run new work belongs to, from app_settings.active_programme_version. '
  'Falls back to 1 for a missing, unparseable or unknown value — it is the '
  'default on every versioned column and must never raise.';

-- Granted to both roles that write, because a column default is evaluated as
-- the *inserting* role, not as the migration's. Without the service_role
-- grant every ledger credit, every submission and every imported conversion
-- would fail with "permission denied for function"; without the
-- authenticated grant a student could not file a redemption request.
revoke execute on function public.current_programme_version() from public, anon;
grant  execute on function public.current_programme_version() to authenticated, service_role;

-- ─── The column, twelve times ───────────────────────────────────────────────
--
-- `not null default current_programme_version()` fills every existing row
-- with 1, which is exactly the backfill V1 needs, and gives every future
-- insert the open run without a single call site changing. The foreign key
-- is what stops a hand-written row naming a run that does not exist.

alter table public.campaigns
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.surveys
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.submissions
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.survey_responses
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.referral_conversions
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.referral_clicks
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.point_ledger
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.achievements
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.badge_awards
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.redemption_requests
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.payout_batches
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

alter table public.payouts
  add column if not exists version smallint not null
  default public.current_programme_version()
  references public.programme_versions (id);

comment on column public.point_ledger.version is
  'The run this entry belongs to. A balance is the sum of one run''s rows, so '
  'a new run opens at zero with every earlier entry still in the history.';

comment on column public.campaigns.version is
  'The run this campaign belongs to. Its tasks and the submissions against '
  'them inherit it — a task has no version of its own to disagree with.';

-- ─── Proof inherits the run of the work it proves ───────────────────────────
--
-- Not the open run. A screenshot uploaded to a V1 campaign an hour after V2
-- opens is V1 work: it is credited against a V1 task and counts towards a V1
-- percentage, and stamping it V2 would put an orphan in the new run's
-- numerator with nothing in the denominator to match it.

-- SECURITY DEFINER because a trigger runs under the inserting role and its
-- RLS with it. `campaigns_select_live` shows only live campaigns, so proof
-- filed against one that has since ended would read no parent row, fall
-- through to the open run, and put V1 work in V2 — precisely the mis-stamping
-- this migration exists to make impossible.
create or replace function public.stamp_submission_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select c.version into new.version
  from public.campaign_tasks ct
  join public.campaigns c on c.id = ct.campaign_id
  where ct.id = new.campaign_task_id;

  -- The foreign key makes an orphan task impossible, so this is the
  -- belt-and-braces path only. A null here would fail the not-null anyway.
  if new.version is null then
    new.version := public.current_programme_version();
  end if;

  return new;
end;
$$;

drop trigger if exists submissions_stamp_version on public.submissions;

create trigger submissions_stamp_version
  before insert on public.submissions
  for each row execute function public.stamp_submission_version();

create or replace function public.stamp_response_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select s.version into new.version
  from public.surveys s
  where s.id = new.survey_id;

  if new.version is null then
    new.version := public.current_programme_version();
  end if;

  return new;
end;
$$;

drop trigger if exists survey_responses_stamp_version on public.survey_responses;

create trigger survey_responses_stamp_version
  before insert on public.survey_responses
  for each row execute function public.stamp_response_version();

-- ─── Uniqueness, widened by one column ──────────────────────────────────────

-- Idempotent crediting, per run. The bonus source ids are built from an
-- ambassador id and a count, so without the version a V2 streak of three
-- weeks is refused as a duplicate of the V1 one and never paid.
drop index if exists public.point_ledger_source_direction_key;

create unique index if not exists point_ledger_source_direction_key
  on public.point_ledger (source_type, source_id, direction, version)
  where source_id is not null;

comment on index public.point_ledger_source_direction_key is
  'At most one credit and one reversal per source, per run. The run is part '
  'of the key because the bonus source ids are composed from a count and '
  'would otherwise collide with the same ambassador''s earlier run.';

-- Re-importing the same CSV is a no-op within a run, and a genuinely new
-- install in the next run is not mistaken for one already seen.
alter table public.referral_conversions
  drop constraint if exists referral_conversions_idempotent;

create unique index if not exists referral_conversions_idempotent
  on public.referral_conversions (code, external_user_ref, version);

-- A badge is earned per run, so a new run starts with none of them held.
alter table public.badge_awards
  drop constraint if exists badge_awards_badge_id_ambassador_id_key;

drop index if exists public.badge_awards_badge_id_ambassador_id_key;

create unique index if not exists badge_awards_unique_per_run
  on public.badge_awards (badge_id, ambassador_id, version);

-- ─── Indexes ────────────────────────────────────────────────────────────────
-- Every read model now carries a version predicate, so each of these is on
-- the hot path of an admin page or a student dashboard.

create index if not exists campaigns_version_idx
  on public.campaigns (version, status);
create index if not exists surveys_version_idx
  on public.surveys (version, status);
create index if not exists submissions_version_idx
  on public.submissions (version, status);
create index if not exists survey_responses_version_idx
  on public.survey_responses (version, status);
create index if not exists referral_conversions_version_idx
  on public.referral_conversions (version, status);
create index if not exists referral_clicks_version_idx
  on public.referral_clicks (version);
create index if not exists point_ledger_version_idx
  on public.point_ledger (version, ambassador_id);
create index if not exists achievements_version_idx
  on public.achievements (version, ambassador_id);
create index if not exists badge_awards_version_idx
  on public.badge_awards (version, ambassador_id);
create index if not exists redemption_requests_version_idx
  on public.redemption_requests (version, status);
create index if not exists payouts_version_idx
  on public.payouts (version, kind);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Readable by every signed-in user: a student's own screens resolve the open
-- run through the functions below, but the label is not a secret and a page
-- that wants to name the run should not need an admin to read it. Only an
-- admin writes.

alter table public.programme_versions enable row level security;

drop policy if exists programme_versions_select_all on public.programme_versions;
create policy programme_versions_select_all on public.programme_versions
  for select to authenticated
  using (true);

drop policy if exists programme_versions_all_admin on public.programme_versions;
create policy programme_versions_all_admin on public.programme_versions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── New ambassadors get links to the open run's surveys ────────────────────
--
-- Unchanged from 0011 apart from the version predicate. Without it, somebody
-- activated during V2 is issued a personal link to every survey V1 left in
-- the 'live' state, and those links appear on their Tasks page as work.

create or replace function public.issue_survey_links_for_ambassador()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'ambassador' and new.status = 'active' then
    insert into public.survey_links (survey_id, ambassador_id, slug)
    select s.id, new.id, public.gen_survey_slug()
    from public.surveys s
    where s.status = 'live'
      and s.version = public.current_programme_version()
      and not exists (
        select 1
        from public.survey_links l
        where l.survey_id = s.id
          and l.ambassador_id = new.id
      )
    on conflict (survey_id, ambassador_id) do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function public.issue_survey_links_for_ambassador()
  from public, anon, authenticated;

-- ─── Balances and boards, scoped to one run ─────────────────────────────────

create or replace function public.ambassador_points(target uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)::integer
  from public.point_ledger
  where ambassador_id = target
    and version = public.current_programme_version();
$$;

create or replace function public.leaderboard(limit_count integer default 100)
returns table (
  "position"    bigint,
  ambassador_id uuid,
  full_name     text,
  college       text,
  points        integer,
  is_me         boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select
      p.id,
      p.full_name,
      p.college,
      coalesce(sum(l.delta), 0)::integer as points
    from public.profiles p
    left join public.point_ledger l
      on l.ambassador_id = p.id
     and l.version = public.current_programme_version()
    where p.role = 'ambassador'
      and p.status = 'active'
    group by p.id, p.full_name, p.college
  )
  select
    rank() over (order by totals.points desc),
    totals.id,
    totals.full_name,
    totals.college,
    totals.points,
    totals.id = auth.uid()
  from totals
  order by totals.points desc, totals.full_name asc
  limit greatest(1, least(limit_count, 500));
$$;

create or replace function public.my_standing()
returns table (points integer, "position" bigint, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select
      p.id,
      coalesce(sum(l.delta), 0)::integer as pts
    from public.profiles p
    left join public.point_ledger l
      on l.ambassador_id = p.id
     and l.version = public.current_programme_version()
    where p.role = 'ambassador'
      and p.status = 'active'
    group by p.id
  ),
  ranked as (
    select totals.id, totals.pts, rank() over (order by totals.pts desc) as pos
    from totals
  )
  select
    coalesce((select ranked.pts from ranked where ranked.id = auth.uid()), 0),
    coalesce((select ranked.pos from ranked where ranked.id = auth.uid()), 0::bigint),
    (select count(*) from ranked);
$$;

create or replace function public.leaderboard_window(
  window_key   text default 'all',
  city_filter  text default null,
  batch_filter text default null,
  phase_filter public.program_phase default null,
  limit_count  integer default 100
)
returns table (
  "position"    bigint,
  ambassador_id uuid,
  full_name     text,
  college       text,
  city          text,
  batch         text,
  points        integer,
  is_me         boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select
      p.id,
      p.full_name,
      p.college,
      p.city,
      p.batch,
      coalesce(sum(l.delta) filter (
        where l.created_at >= public.window_start(window_key)
          and (phase_filter is null or l.phase = phase_filter)
      ), 0)::integer as pts
    from public.profiles p
    left join public.point_ledger l
      on l.ambassador_id = p.id
     and l.version = public.current_programme_version()
    where p.role = 'ambassador'
      and p.status = 'active'
      and (city_filter is null or p.city = city_filter)
      and (batch_filter is null or p.batch = batch_filter)
    group by p.id, p.full_name, p.college, p.city, p.batch
  )
  select
    rank() over (order by totals.pts desc),
    totals.id,
    totals.full_name,
    totals.college,
    totals.city,
    totals.batch,
    totals.pts,
    totals.id = auth.uid()
  from totals
  order by totals.pts desc, totals.full_name asc
  limit greatest(1, least(limit_count, 500));
$$;

create or replace function public.my_standing_window(
  window_key   text default 'all',
  phase_filter public.program_phase default null
)
returns table (points integer, "position" bigint, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select
      p.id,
      coalesce(sum(l.delta) filter (
        where l.created_at >= public.window_start(window_key)
          and (phase_filter is null or l.phase = phase_filter)
      ), 0)::integer as pts
    from public.profiles p
    left join public.point_ledger l
      on l.ambassador_id = p.id
     and l.version = public.current_programme_version()
    where p.role = 'ambassador' and p.status = 'active'
    group by p.id
  ),
  ranked as (
    select totals.id, totals.pts, rank() over (order by totals.pts desc) as pos
    from totals
  )
  select
    coalesce((select ranked.pts from ranked where ranked.id = auth.uid()), 0),
    coalesce((select ranked.pos from ranked where ranked.id = auth.uid()), 0::bigint),
    (select count(*) from ranked);
$$;

create or replace function public.batch_standings(window_key text default 'all')
returns table (
  batch      text,
  members    bigint,
  points     integer,
  avg_points integer,
  downloads  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      coalesce(nullif(btrim(p.batch), ''), 'Unassigned') as b,
      p.id,
      coalesce(sum(l.delta) filter (
        where l.created_at >= public.window_start(window_key)
      ), 0)::integer as pts
    from public.profiles p
    left join public.point_ledger l
      on l.ambassador_id = p.id
     and l.version = public.current_programme_version()
    where p.role = 'ambassador' and p.status = 'active'
    group by 1, p.id
  ),
  dl as (
    select coalesce(nullif(btrim(p.batch), ''), 'Unassigned') as b, count(rc.id) as n
    from public.profiles p
    left join public.referral_conversions rc
      on rc.ambassador_id = p.id
     and rc.status = 'counted'
     and rc.version = public.current_programme_version()
    where p.role = 'ambassador' and p.status = 'active'
    group by 1
  )
  select
    base.b,
    count(*)::bigint,
    sum(base.pts)::integer,
    (avg(base.pts))::integer,
    coalesce(max(dl.n), 0)
  from base
  left join dl on dl.b = base.b
  group by base.b
  order by sum(base.pts) desc;
$$;

-- The public page counts the run that is open. Ambassadors are people and
-- carry across, so that figure is unscoped; the other three are results.
create or replace function public.public_stats()
returns table (
  ambassadors bigint,
  responses   bigint,
  points      bigint,
  downloads   bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.profiles
      where role = 'ambassador' and status = 'active'),
    (select count(*) from public.survey_responses
      where status = 'valid' and version = public.current_programme_version()),
    (select coalesce(sum(delta), 0) from public.point_ledger
      where delta > 0 and version = public.current_programme_version()),
    (select count(*) from public.referral_conversions
      where status = 'counted' and version = public.current_programme_version());
$$;

revoke execute on function public.public_stats() from public;
grant  execute on function public.public_stats() to anon, authenticated;

-- ─── A student's own figures ────────────────────────────────────────────────

create or replace function public.my_survey_stats()
returns table (
  survey_id       uuid,
  survey_title    text,
  slug            text,
  click_count     integer,
  valid_responses bigint,
  flagged         bigint,
  points_earned   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.title,
    l.slug,
    l.click_count,
    count(r.id) filter (where r.status = 'valid'),
    count(r.id) filter (where r.status in ('flagged', 'duplicate')),
    coalesce((
      select sum(pl.delta)::integer
      from public.point_ledger pl
      where pl.ambassador_id = auth.uid()
        and pl.reason = 'survey_response'
        and pl.source_type = 'survey_response'
        and pl.version = public.current_programme_version()
        and pl.source_id in (
          select rr.id::text from public.survey_responses rr
          where rr.survey_id = s.id and rr.ambassador_id = auth.uid()
        )
    ), 0)
  from public.survey_links l
  join public.surveys s on s.id = l.survey_id
  left join public.survey_responses r
    on r.survey_link_id = l.id
  where l.ambassador_id = auth.uid()
    and s.status = 'live'
    and s.version = public.current_programme_version()
  group by s.id, s.title, l.slug, l.click_count
  order by s.created_at desc;
$$;

create or replace function public.my_referral_stats()
returns table (
  code            text,
  total_confirmed bigint,
  points_earned   integer,
  last_conversion timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.referral_code,
    count(c.id) filter (where c.status = 'counted'),
    coalesce((
      select sum(pl.delta)::integer
      from public.point_ledger pl
      where pl.ambassador_id = auth.uid()
        and pl.reason = 'referral'
        and pl.version = public.current_programme_version()
    ), 0),
    max(c.converted_at) filter (where c.status = 'counted')
  from public.profiles p
  left join public.referral_conversions c
    on c.ambassador_id = p.id
   and c.version = public.current_programme_version()
  where p.id = auth.uid()
  group by p.referral_code;
$$;

-- ─── Turnaround, per run ────────────────────────────────────────────────────
--
-- The version argument is last, so the two existing named-argument callers
-- are unaffected. Null means the open run, which is what every caller that
-- does not care about history wants.

drop function if exists public.time_up(uuid, uuid, timestamptz, timestamptz);

create function public.time_up(
  p_ambassador_id    uuid        default null,
  p_campaign_task_id uuid        default null,
  p_period_start     timestamptz default null,
  p_period_end       timestamptz default null,
  p_version          smallint    default null
)
returns table (
  ambassador_id    uuid,
  campaign_task_id uuid,
  posted_at        timestamptz,
  submitted_at     timestamptz,
  seconds          bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select coalesce(p_version, public.current_programme_version()) as id
  ),
  credited as (
    select
      s.ambassador_id    as amb,
      s.campaign_task_id as task,
      min(s.uploaded_at) as answered_at
    from public.submissions s
    cross join v
    where s.status in ('approved', 'auto_approved')
      and s.version = v.id
      and (p_ambassador_id is null or s.ambassador_id = p_ambassador_id)
      and (p_campaign_task_id is null or s.campaign_task_id = p_campaign_task_id)
    group by s.ambassador_id, s.campaign_task_id
  )
  select
    cr.amb,
    cr.task,
    greatest(ct.posted_at, c.published_at, c.starts_at),
    cr.answered_at,
    greatest(
      0,
      extract(epoch from cr.answered_at - greatest(ct.posted_at, c.published_at, c.starts_at))
    )::bigint
  from credited cr
  join public.campaign_tasks ct on ct.id = cr.task
  join public.campaigns c on c.id = ct.campaign_id
  where c.status <> 'draft'
    and (
      p_period_start is null
      or p_period_end is null
      or (
        c.starts_at < p_period_end
        and coalesce(c.ends_at, p_period_end) >= p_period_start
      )
    );
$$;

comment on function public.time_up(uuid, uuid, timestamptz, timestamptz, smallint) is
  'Internal. Turnaround per ambassador per task within one run: posted -> '
  'submitted, in seconds. Tie-breaks completion_leaderboard(); never '
  'surfaced in the UI.';

revoke execute on function public.time_up(uuid, uuid, timestamptz, timestamptz, smallint)
  from public, anon, authenticated;

-- ─── The completion board ───────────────────────────────────────────────────
--
-- Identical to 0045 apart from the run: campaigns, surveys and the
-- submissions joined to them are all restricted to one, and `spent` passes
-- the same one down to time_up. `p_version` is last and defaults to the open
-- run, so every existing caller is unchanged; /admin passes it explicitly to
-- read an earlier run's final standings.

drop function if exists public.completion_leaderboard(integer, uuid);

create function public.completion_leaderboard(
  limit_count integer  default 200,
  viewer      uuid     default null,
  p_version   smallint default null
)
returns table (
  "position"       integer,
  ambassador_id    uuid,
  full_name        text,
  college          text,
  batch            text,
  total_tasks      integer,
  approved_tasks   integer,
  completion_pct   integer,
  is_me            boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with subject as (
    select
      case
        when coalesce(public.is_admin(), false) and viewer is not null
          then viewer
        else auth.uid()
      end as id,
      coalesce(public.is_admin(), false) and viewer is null as unscoped
  ),
  bounds as (
    select
      date_trunc('month', now())::date as period_start,
      (date_trunc('month', now()) + interval '1 month')::date as period_end,
      s.id as viewer_id,
      s.unscoped as viewer_unscoped,
      (select p.batch from public.profiles p where p.id = s.id) as viewer_batch,
      coalesce(p_version, public.current_programme_version()) as run,
      coalesce((
        select value::text::integer
        from public.app_settings
        where key = 'stipend_min_responses_per_survey'
      ), 10) as min_responses
    from subject s
  ),
  windows as (
    select
      c.id as campaign_id,
      case
        when c.status in ('ended', 'archived') then least(
          coalesce(c.ended_at, 'infinity'::timestamptz),
          coalesce(c.ends_at, 'infinity'::timestamptz)
        )
        else coalesce(c.ends_at, b.period_end::timestamptz)
      end as reachable_until
    from public.campaigns c
    cross join bounds b
    where c.status <> 'draft'
      and c.version = b.run
      and c.starts_at < b.period_end::timestamptz
  ),
  members as (
    select
      p.id as ambassador_id,
      p.full_name,
      p.college,
      p.batch,
      greatest(
        b.period_start::timestamptz,
        coalesce(p.activated_at, p.created_at)
      ) as reachable_from
    from public.profiles p
    cross join bounds b
    where p.role = 'ambassador'
      and p.status = 'active'
      and (
        b.viewer_unscoped
        or b.viewer_batch is null
        or p.batch = b.viewer_batch
      )
  ),
  member_tasks as (
    select
      m.ambassador_id,
      ct.id as task_id,
      s.id as submission_id
    from members m
    left join windows w on w.reachable_until >= m.reachable_from
    left join public.campaign_tasks ct on ct.campaign_id = w.campaign_id
    left join public.submissions s
      on s.campaign_task_id = ct.id
      and s.ambassador_id = m.ambassador_id
      and s.status in ('approved', 'auto_approved')
  ),
  counted as (
    select
      ambassador_id,
      count(distinct task_id)::integer as total_tasks,
      count(distinct task_id) filter (
        where submission_id is not null
      )::integer as approved_tasks
    from member_tasks
    group by ambassador_id
  ),
  survey_pool as (
    select
      m.ambassador_id,
      sv.id as survey_id,
      (
        select count(*)
        from public.survey_responses r
        where r.survey_id = sv.id
          and r.ambassador_id = m.ambassador_id
          and r.status = 'valid'
      ) as answers,
      case
        when sv.audience = 'participant' then 1
        when coalesce(sv.response_cap, 0) > 0 then sv.response_cap
        else b.min_responses
      end as needed
    from members m
    cross join bounds b
    join public.survey_links l on l.ambassador_id = m.ambassador_id
    join public.surveys sv on sv.id = l.survey_id
    where sv.status <> 'draft'
      and sv.version = b.run
      and sv.created_at < b.period_end::timestamptz
      and (
        sv.status = 'live'
        or coalesce(sv.closed_at, 'infinity'::timestamptz) >= m.reachable_from
      )
  ),
  surveys_counted as (
    select
      ambassador_id,
      count(*)::integer as total_surveys,
      count(*) filter (where answers >= needed)::integer as done_surveys
    from survey_pool
    group by ambassador_id
  ),
  totals as (
    select
      m.ambassador_id,
      coalesce(cn.total_tasks, 0) + coalesce(sc.total_surveys, 0) as total_tasks,
      coalesce(cn.approved_tasks, 0) + coalesce(sc.done_surveys, 0) as approved_tasks
    from members m
    left join counted cn on cn.ambassador_id = m.ambassador_id
    left join surveys_counted sc on sc.ambassador_id = m.ambassador_id
  ),
  spent as (
    select t.ambassador_id as aid, sum(t.seconds)::bigint as total_seconds
    from bounds b
    cross join lateral public.time_up(
      p_period_start => b.period_start::timestamptz,
      p_period_end   => b.period_end::timestamptz,
      p_version      => b.run::smallint
    ) t
    group by t.ambassador_id
  ),
  progress as (
    select
      m.ambassador_id,
      m.full_name,
      m.college,
      m.batch,
      tt.total_tasks,
      tt.approved_tasks,
      case
        when tt.total_tasks = 0 then 0
        else least(100, round((tt.approved_tasks::numeric * 100) / tt.total_tasks)::integer)
      end as completion_pct,
      coalesce(sp.total_seconds, 0) as time_up_seconds,
      m.ambassador_id = b.viewer_id as is_me
    from members m
    cross join bounds b
    join totals tt on tt.ambassador_id = m.ambassador_id
    left join spent sp on sp.aid = m.ambassador_id
  ),
  ranked as (
    select
      rank() over (
        order by completion_pct desc, approved_tasks desc, time_up_seconds asc
      ) as rank_position,
      *
    from progress
  )
  select
    rank_position::integer,
    ambassador_id,
    full_name,
    college,
    batch,
    total_tasks,
    approved_tasks,
    completion_pct,
    is_me
  from ranked
  order by completion_pct desc, approved_tasks desc, time_up_seconds asc, full_name
  limit greatest(1, least(coalesce(limit_count, 200), 1000));
$$;

revoke execute on function public.completion_leaderboard(integer, uuid, smallint)
  from public, anon;
grant execute on function public.completion_leaderboard(integer, uuid, smallint)
  to authenticated;

comment on function public.completion_leaderboard(integer, uuid, smallint) is
  'This month''s completion board for one run of the programme, scoped to the '
  'viewer''s batch and, per ambassador, to the work they could actually reach. '
  '`p_version` defaults to the open run; naming an earlier one reads that '
  'run''s standings and is how /admin looks back at V1.';

-- ─── The same figure, for one ambassador ────────────────────────────────────

drop function if exists public.ambassador_completion(uuid);

create function public.ambassador_completion(
  target    uuid,
  p_version smallint default null
)
returns table (
  total_tasks      integer,
  approved_tasks   integer,
  completion_pct   integer
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', now())::date as period_start,
      (date_trunc('month', now()) + interval '1 month')::date as period_end,
      greatest(
        date_trunc('month', now()),
        coalesce(
          (
            select coalesce(p.activated_at, p.created_at)
            from public.profiles p
            where p.id = target
          ),
          date_trunc('month', now())
        )
      ) as reachable_from,
      coalesce(p_version, public.current_programme_version()) as run,
      coalesce((
        select value::text::integer
        from public.app_settings
        where key = 'stipend_min_responses_per_survey'
      ), 10) as min_responses
  ),
  task_pool as (
    select ct.id
    from public.campaign_tasks ct
    join public.campaigns c on c.id = ct.campaign_id
    cross join bounds b
    where c.status <> 'draft'
      and c.version = b.run
      and c.starts_at < b.period_end::timestamptz
      and case
        when c.status in ('ended', 'archived') then least(
          coalesce(c.ended_at, 'infinity'::timestamptz),
          coalesce(c.ends_at, 'infinity'::timestamptz)
        )
        else coalesce(c.ends_at, b.period_end::timestamptz)
      end >= b.reachable_from
  ),
  approved as (
    select count(distinct s.campaign_task_id)::integer as approved_tasks
    from public.submissions s
    join task_pool tp on tp.id = s.campaign_task_id
    where s.status in ('approved', 'auto_approved')
      and s.ambassador_id = target
  ),
  survey_pool as (
    select
      (
        select count(*)
        from public.survey_responses r
        where r.survey_id = sv.id
          and r.ambassador_id = target
          and r.status = 'valid'
      ) as answers,
      case
        when sv.audience = 'participant' then 1
        when coalesce(sv.response_cap, 0) > 0 then sv.response_cap
        else b.min_responses
      end as needed
    from public.survey_links l
    join public.surveys sv on sv.id = l.survey_id
    cross join bounds b
    where l.ambassador_id = target
      and sv.status <> 'draft'
      and sv.version = b.run
      and sv.created_at < b.period_end::timestamptz
      and (
        sv.status = 'live'
        or coalesce(sv.closed_at, 'infinity'::timestamptz) >= b.reachable_from
      )
  ),
  tallied as (
    select
      (select count(*) from task_pool)::integer
        + (select count(*) from survey_pool)::integer as total_tasks,
      (select coalesce(approved.approved_tasks, 0) from approved)
        + (select count(*) from survey_pool where answers >= needed)::integer
        as approved_tasks
  )
  select
    tallied.total_tasks,
    tallied.approved_tasks,
    case
      when tallied.total_tasks = 0 then 0
      else least(100, round((tallied.approved_tasks::numeric * 100) / tallied.total_tasks)::integer)
    end
  from tallied
  where public.is_admin() or target = auth.uid();
$$;

comment on function public.ambassador_completion(uuid, smallint) is
  'This month''s completion for one ambassador within one run — campaign '
  'tasks and surveys they could reach since accepting their invite. Same '
  'arithmetic as completion_leaderboard, unranked and not restricted to '
  'active profiles.';

revoke all on function public.ambassador_completion(uuid, smallint) from public;
grant execute on function public.ambassador_completion(uuid, smallint) to authenticated;

-- ─── Stipend eligibility, per run ───────────────────────────────────────────

drop function if exists public.stipend_eligibility(date);

create function public.stipend_eligibility(
  period_start date,
  p_version    smallint default null
)
returns table (
  ambassador_id   uuid,
  full_name       text,
  city            text,
  batch           text,
  total_tasks     integer,
  approved_tasks  integer,
  completion_pct  integer,
  downloads       integer,
  met             boolean,
  at_risk         boolean,
  total_inr       integer,
  active_days     integer,
  inactive        boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  run integer := coalesce(p_version, public.current_programme_version());
  min_completion integer := coalesce((
    select value::text::integer from public.app_settings
    where key = 'stipend_min_completion_pct'
  ), 80);
  min_downloads integer := coalesce((
    select value::text::integer from public.app_settings
    where key = 'stipend_min_downloads'
  ), 15);
  min_responses integer := coalesce((
    select value::text::integer from public.app_settings
    where key = 'stipend_min_responses_per_survey'
  ), 10);
  stipend_amount integer := coalesce((
    select value::text::integer from public.app_settings
    where key = 'stipend_amount_inr'
  ), 3000);
  window_days integer := coalesce((
    select value::text::integer from public.app_settings
    where key = 'activity_window_days'
  ), 10);
  min_active integer := coalesce((
    select value::text::integer from public.app_settings
    where key = 'activity_min_days'
  ), 8);
  period_end date := (period_start + interval '1 month')::date;
  is_current boolean := date_trunc('month', now())::date = period_start;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  with task_pool as (
    select ct.id
    from public.campaign_tasks ct
    join public.campaigns c on c.id = ct.campaign_id
    where c.status <> 'draft'
      and c.version = run
      and c.starts_at < period_end::timestamptz
      and coalesce(c.ends_at, period_end::timestamptz) >= period_start::timestamptz
  ),
  task_totals as (
    select count(*)::integer as total_tasks from task_pool
  ),
  approved as (
    select
      s.ambassador_id as aid,
      count(distinct s.campaign_task_id)::integer as approved_tasks
    from public.submissions s
    join task_pool tp on tp.id = s.campaign_task_id
    where s.status in ('approved', 'auto_approved')
    group by s.ambassador_id
  ),
  survey_pool as (
    select
      l.ambassador_id as aid,
      (
        select count(*)
        from public.survey_responses r
        where r.survey_id = sv.id
          and r.ambassador_id = l.ambassador_id
          and r.status = 'valid'
      ) as answers,
      case
        when sv.audience = 'participant' then 1
        when coalesce(sv.response_cap, 0) > 0 then sv.response_cap
        else min_responses
      end as needed
    from public.survey_links l
    join public.surveys sv on sv.id = l.survey_id
    where sv.status <> 'draft'
      and sv.version = run
      and sv.created_at < period_end::timestamptz
      and (
        sv.status = 'live'
        or coalesce(sv.closed_at, 'infinity'::timestamptz) >= period_start::timestamptz
      )
  ),
  surveys_counted as (
    select
      aid,
      count(*)::integer as total_surveys,
      count(*) filter (where answers >= needed)::integer as done_surveys
    from survey_pool
    group by aid
  ),
  dl as (
    select rc.ambassador_id as aid, count(*)::integer as downloads
    from public.referral_conversions rc
    where rc.status = 'counted'
      and rc.version = run
      and rc.converted_at >= period_start::timestamptz
      and rc.converted_at < period_end::timestamptz
    group by rc.ambassador_id
  ),
  act as (
    select ad.ambassador_id as aid, count(*)::integer as days
    from public.active_days ad
    where ad.day > (now() at time zone 'Asia/Kolkata')::date - window_days
    group by ad.ambassador_id
  ),
  progress as (
    select
      p.id,
      p.full_name,
      p.city,
      p.batch,
      coalesce(tt.total_tasks, 0) + coalesce(sc.total_surveys, 0) as total_tasks,
      coalesce(a.approved_tasks, 0) + coalesce(sc.done_surveys, 0) as approved_tasks,
      coalesce(dl.downloads, 0) as downloads,
      coalesce(act.days, 0) as active_days
    from public.profiles p
    cross join task_totals tt
    left join approved a on a.aid = p.id
    left join surveys_counted sc on sc.aid = p.id
    left join dl on dl.aid = p.id
    left join act on act.aid = p.id
    where p.role = 'ambassador' and p.status = 'active'
  ),
  judged as (
    select
      progress.*,
      case
        when progress.total_tasks = 0 then 0
        else least(
          100,
          round((progress.approved_tasks::numeric * 100) / progress.total_tasks)::integer
        )
      end as completion_pct
    from progress
  ),
  ruled as (
    select
      judged.*,
      judged.total_tasks > 0
        and judged.completion_pct >= min_completion
        and judged.downloads >= min_downloads as met
    from judged
  )
  select
    ruled.id,
    ruled.full_name,
    ruled.city,
    ruled.batch,
    ruled.total_tasks,
    ruled.approved_tasks,
    ruled.completion_pct,
    ruled.downloads,
    ruled.met,
    is_current
      and not ruled.met
      and (ruled.approved_tasks > 0 or ruled.downloads > 0),
    case when ruled.met then stipend_amount else 0 end,
    ruled.active_days,
    ruled.active_days < min_active
  from ruled
  order by ruled.completion_pct desc, ruled.downloads desc, ruled.full_name;
end;
$$;

revoke execute on function public.stipend_eligibility(date, smallint) from public, anon;
grant execute on function public.stipend_eligibility(date, smallint) to authenticated;

comment on function public.stipend_eligibility(date, smallint) is
  'Stipend standing for every active ambassador in a month of one run. '
  'Qualifying needs both halves: completion — campaign tasks and surveys '
  'together — at or above stipend_min_completion_pct, and counted downloads '
  'at or above stipend_min_downloads.';

-- ─── The same rule, for the student themselves ──────────────────────────────
--
-- No version argument: a student only ever sees the run that is open. Their
-- earlier run''s months simply stop appearing, which is what starting again
-- means — and every row behind them is still there.

drop function if exists public.my_stipend_progress(integer);

create or replace function public.my_stipend_progress(months_back integer default 6)
returns table (
  period          date,
  total_tasks     integer,
  approved_tasks  integer,
  completion_pct  integer,
  downloads       integer,
  met             boolean,
  total_inr       integer,
  paid_status     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  run integer := public.current_programme_version();
  min_completion integer := coalesce((
    select value::text::integer from public.app_settings
    where key = 'stipend_min_completion_pct'
  ), 80);
  min_downloads integer := coalesce((
    select value::text::integer from public.app_settings
    where key = 'stipend_min_downloads'
  ), 15);
  min_responses integer := coalesce((
    select value::text::integer from public.app_settings
    where key = 'stipend_min_responses_per_survey'
  ), 10);
  stipend_amount integer := coalesce((
    select value::text::integer from public.app_settings
    where key = 'stipend_amount_inr'
  ), 3000);
  span integer := greatest(1, least(coalesce(months_back, 6), 24));
begin
  if me is null then
    return;
  end if;

  return query
  with periods as (
    select (date_trunc('month', now()) - (n || ' months')::interval)::date as p
    from generate_series(0, span - 1) as n
  ),
  task_totals as (
    select periods.p, count(ct.id)::integer as total_tasks
    from periods
    left join public.campaigns c
      on c.status <> 'draft'
     and c.version = run
     and c.starts_at < (periods.p + interval '1 month')::timestamptz
     and coalesce(c.ends_at, (periods.p + interval '1 month')::timestamptz) >= periods.p::timestamptz
    left join public.campaign_tasks ct on ct.campaign_id = c.id
    group by periods.p
  ),
  approved as (
    select periods.p, count(distinct s.campaign_task_id)::integer as approved_tasks
    from periods
    join public.campaigns c
      on c.status <> 'draft'
     and c.version = run
     and c.starts_at < (periods.p + interval '1 month')::timestamptz
     and coalesce(c.ends_at, (periods.p + interval '1 month')::timestamptz) >= periods.p::timestamptz
    join public.campaign_tasks ct on ct.campaign_id = c.id
    join public.submissions s on s.campaign_task_id = ct.id
    where s.ambassador_id = me and s.status in ('approved', 'auto_approved')
    group by periods.p
  ),
  survey_pool as (
    select
      periods.p,
      (
        select count(*)
        from public.survey_responses r
        where r.survey_id = sv.id
          and r.ambassador_id = me
          and r.status = 'valid'
      ) as answers,
      case
        when sv.audience = 'participant' then 1
        when coalesce(sv.response_cap, 0) > 0 then sv.response_cap
        else min_responses
      end as needed
    from periods
    join public.survey_links l on l.ambassador_id = me
    join public.surveys sv on sv.id = l.survey_id
    where sv.status <> 'draft'
      and sv.version = run
      and sv.created_at < (periods.p + interval '1 month')::timestamptz
      and (
        sv.status = 'live'
        or coalesce(sv.closed_at, 'infinity'::timestamptz) >= periods.p::timestamptz
      )
  ),
  surveys_counted as (
    select p, count(*)::integer as total_surveys,
           count(*) filter (where answers >= needed)::integer as done_surveys
    from survey_pool
    group by p
  ),
  dl as (
    select date_trunc('month', rc.converted_at)::date as p, count(*)::integer as downloads
    from public.referral_conversions rc
    where rc.ambassador_id = me
      and rc.status = 'counted'
      and rc.version = run
    group by 1
  ),
  pay as (
    select b.period_month as p, max(po.status::text) as st
    from public.payouts po
    join public.payout_batches b on b.id = po.batch_id
    where po.ambassador_id = me
      and po.kind = 'stipend'
      and po.version = run
      and b.period_month is not null
    group by 1
  ),
  monthly as (
    select
      periods.p,
      coalesce(task_totals.total_tasks, 0) + coalesce(sc.total_surveys, 0) as total_tasks,
      coalesce(approved.approved_tasks, 0) + coalesce(sc.done_surveys, 0) as approved_tasks,
      coalesce(dl.downloads, 0) as downloads,
      coalesce(pay.st, 'none') as paid_status
    from periods
    left join task_totals on task_totals.p = periods.p
    left join approved on approved.p = periods.p
    left join surveys_counted sc on sc.p = periods.p
    left join dl on dl.p = periods.p
    left join pay on pay.p = periods.p
  ),
  judged as (
    select
      monthly.*,
      case
        when monthly.total_tasks = 0 then 0
        else least(
          100,
          round((monthly.approved_tasks::numeric * 100) / monthly.total_tasks)::integer
        )
      end as completion_pct
    from monthly
  ),
  ruled as (
    select
      judged.*,
      judged.total_tasks > 0
        and judged.completion_pct >= min_completion
        and judged.downloads >= min_downloads as met
    from judged
  )
  select
    ruled.p,
    ruled.total_tasks,
    ruled.approved_tasks,
    ruled.completion_pct,
    ruled.downloads,
    ruled.met,
    case when ruled.met then stipend_amount else 0 end,
    ruled.paid_status
  from ruled
  order by ruled.p desc;
end;
$$;

revoke execute on function public.my_stipend_progress(integer) from public, anon;
grant execute on function public.my_stipend_progress(integer) to authenticated;

comment on function public.my_stipend_progress(integer) is
  'The signed-in student''s own stipend standing for the open run, month by '
  'month. Same rule as stipend_eligibility — completion over campaign tasks '
  'and surveys, and downloads, both required.';
