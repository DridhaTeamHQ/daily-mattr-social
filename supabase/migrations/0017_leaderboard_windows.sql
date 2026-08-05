-- ============================================================================
-- 0017 — Time-windowed, filterable leaderboards, and the public totals
-- ============================================================================
-- The original `leaderboard()` summed the whole ledger, so it could only ever
-- answer "all time". A monthly board is not a display option layered on that
-- number — it is a different sum — so the window has to reach the aggregate.
--
-- `leaderboard()` and `my_standing()` are left in place, untouched. They are
-- the all-time case, they already work, and rewriting a function the student
-- dashboard depends on to add a parameter it never passes buys nothing.
-- ============================================================================

create or replace function public.window_start(window_key text)
returns timestamptz
language sql
immutable
as $$
  select case lower(coalesce(window_key, 'all'))
    when 'day'   then date_trunc('day', now())
    when 'week'  then date_trunc('week', now())
    when 'month' then date_trunc('month', now())
    else '-infinity'::timestamptz
  end;
$$;

-- SECURITY DEFINER for the same reason the original is: it reads across every
-- ambassador, and exposes exactly name/college/city/batch/points and nothing
-- else. Students must never be able to select each other's email or phone.
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
      -- FILTER rather than a WHERE on the join: a WHERE would drop anyone with
      -- no points inside the window, and someone sitting on zero this month is
      -- exactly who an admin is looking for.
      coalesce(sum(l.delta) filter (
        where l.created_at >= public.window_start(window_key)
          and (phase_filter is null or l.phase = phase_filter)
      ), 0)::integer as pts
    from public.profiles p
    left join public.point_ledger l on l.ambassador_id = p.id
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
    left join public.point_ledger l on l.ambassador_id = p.id
    where p.role = 'ambassador' and p.status = 'active'
    group by p.id
  ),
  ranked as (
    select totals.id, totals.pts, rank() over (order by totals.pts desc) as pos from totals
  )
  select
    coalesce((select ranked.pts from ranked where ranked.id = auth.uid()), 0),
    coalesce((select ranked.pos from ranked where ranked.id = auth.uid()), 0::bigint),
    (select count(*) from ranked);
$$;

-- Batch vs batch. Averaged as well as totalled, because a batch of thirty will
-- always out-total a batch of eight and a raw sum would just rank by headcount.
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
      coalesce(sum(l.delta) filter (where l.created_at >= public.window_start(window_key)), 0)::integer as pts
    from public.profiles p
    left join public.point_ledger l on l.ambassador_id = p.id
    where p.role = 'ambassador' and p.status = 'active'
    group by 1, p.id
  ),
  dl as (
    select coalesce(nullif(btrim(p.batch), ''), 'Unassigned') as b, count(rc.id) as n
    from public.profiles p
    left join public.referral_conversions rc
      on rc.ambassador_id = p.id and rc.status = 'counted'
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

-- The public transparency page. Returns four totals and nothing else — no
-- names, no colleges, no per-person anything — because it is readable by
-- anyone on the internet with no session at all.
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
    (select count(*) from public.profiles where role = 'ambassador' and status = 'active'),
    (select count(*) from public.survey_responses where status = 'valid'),
    (select coalesce(sum(delta), 0) from public.point_ledger where delta > 0),
    (select count(*) from public.referral_conversions where status = 'counted');
$$;

-- Postgres grants EXECUTE to PUBLIC by default, so every one of these needs an
-- explicit revoke before the grant means anything (see 0007).
revoke execute on function public.leaderboard_window(text, text, text, public.program_phase, integer) from public, anon;
revoke execute on function public.my_standing_window(text, public.program_phase) from public, anon;
revoke execute on function public.batch_standings(text) from public, anon;
revoke execute on function public.window_start(text) from public, anon;

grant execute on function public.leaderboard_window(text, text, text, public.program_phase, integer) to authenticated;
grant execute on function public.my_standing_window(text, public.program_phase) to authenticated;
grant execute on function public.batch_standings(text) to authenticated;
grant execute on function public.window_start(text) to authenticated;

-- public_stats is the one function anon is MEANT to reach.
revoke execute on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
