-- ============================================================================
-- 0024 — The programme's terms, as something the database can compute
-- ============================================================================
-- The published criteria are:
--
--   30 verified app downloads per month
--   2 to 3 feedback surveys every month
--   10 responses for each survey
--   ₹500 for every additional 50 verified downloads beyond the monthly target
--   ₹3,000 monthly stipend
--
-- Two of those were not represented at all. A survey counted towards the
-- monthly target whatever it collected, so three links with one response each
-- looked identical to three surveys that actually worked; and there was no
-- notion of earning above the target, so the number that motivates the top of
-- the cohort existed only on a slide.
--
-- Plus an activity rule: a student is expected on the app most days, and
-- somebody who has stopped opening it is the single earliest signal that they
-- are about to stop delivering. Eight days in every ten, counted from days
-- they actually appeared rather than from anything they earned — earning is
-- lumpy, attention is not.
-- ============================================================================

-- ─── Settings ───────────────────────────────────────────────────────────────
-- Thresholds live in app_settings so a change is a row, not a deploy.
insert into public.app_settings (key, value) values
  ('stipend_amount_inr',               to_jsonb(3000)),
  ('stipend_min_surveys',              to_jsonb(2)),
  ('stipend_min_responses_per_survey', to_jsonb(10)),
  ('stipend_bonus_per_downloads',      to_jsonb(50)),
  ('stipend_bonus_inr',                to_jsonb(500)),
  ('activity_window_days',             to_jsonb(10)),
  ('activity_min_days',                to_jsonb(8))
on conflict (key) do update set value = excluded.value;

-- ─── Days a student was here ────────────────────────────────────────────────
-- One row per person per day. A date rather than a timestamp because the
-- question is "did they show up", and a primary key on the pair rather than a
-- unique index because there is no other identity a row like this could have.
create table if not exists public.active_days (
  ambassador_id uuid not null references public.profiles(id) on delete cascade,
  day           date not null,
  primary key (ambassador_id, day)
);

create index if not exists active_days_day_idx on public.active_days (day desc);

alter table public.active_days enable row level security;

-- Students read their own; admins read everyone's. Nobody writes directly —
-- the only way in is the function below, which cannot be pointed at somebody
-- else because it takes no argument.
drop policy if exists active_days_self on public.active_days;
create policy active_days_self on public.active_days
  for select using (ambassador_id = auth.uid() or public.is_admin());

create or replace function public.touch_active_day()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.active_days (ambassador_id, day)
  values (auth.uid(), (now() at time zone 'Asia/Kolkata')::date)
  on conflict do nothing;
$$;

revoke execute on function public.touch_active_day() from public, anon;
grant execute on function public.touch_active_day() to authenticated;

-- ─── Eligibility, with the parts that were missing ──────────────────────────
-- Dropped rather than replaced: the return type gains columns, and Postgres
-- will not change the shape of an existing function in place.
drop function if exists public.stipend_eligibility(date);

create or replace function public.stipend_eligibility(period_start date)
returns table (
  ambassador_id      uuid,
  full_name          text,
  city               text,
  batch              text,
  downloads          bigint,
  surveys            bigint,
  -- Surveys that cleared the response floor. `surveys` counts the ones they
  -- collected anything on at all; this is the one the target is measured in.
  qualifying_surveys bigint,
  met                boolean,
  at_risk            boolean,
  -- ₹ for every whole extra block of downloads past the target.
  bonus_inr          integer,
  total_inr          integer,
  active_days        integer,
  inactive           boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  min_downloads   integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_min_downloads'), 30);
  min_surveys     integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_min_surveys'), 2);
  min_responses   integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_min_responses_per_survey'), 10);
  bonus_per       integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_bonus_per_downloads'), 50);
  bonus_amount    integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_bonus_inr'), 500);
  stipend_amount  integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_amount_inr'), 3000);
  window_days     integer := coalesce((select value::text::integer from public.app_settings where key = 'activity_window_days'), 10);
  min_active      integer := coalesce((select value::text::integer from public.app_settings where key = 'activity_min_days'), 8);
  period_end      date := (period_start + interval '1 month')::date;
  -- "At risk" only means anything while the month is still running. On a past
  -- month every shortfall is simply a miss, and flagging it as a risk would be
  -- telling an admin to chase someone about a month that has already closed.
  is_current      boolean := date_trunc('month', now())::date = period_start;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  with dl as (
    select rc.ambassador_id as aid, count(*) as n
    from public.referral_conversions rc
    where rc.status = 'counted'
      and rc.converted_at >= period_start
      and rc.converted_at < period_end
    group by rc.ambassador_id
  ),
  -- Per ambassador per survey, so a survey can be judged against the response
  -- floor before it is counted towards the monthly target.
  per_survey as (
    select sr.ambassador_id as aid, sr.survey_id as sid, count(*) as n
    from public.survey_responses sr
    where sr.status = 'valid'
      and sr.submitted_at >= period_start
      and sr.submitted_at < period_end
      and sr.ambassador_id is not null
    group by 1, 2
  ),
  sv as (
    select
      aid,
      count(*) as touched,
      count(*) filter (where n >= min_responses) as qualifying
    from per_survey
    group by aid
  ),
  act as (
    select ad.ambassador_id as aid, count(*)::integer as days
    from public.active_days ad
    where ad.day > (now() at time zone 'Asia/Kolkata')::date - window_days
    group by ad.ambassador_id
  )
  select
    p.id,
    p.full_name,
    p.city,
    p.batch,
    coalesce(dl.n, 0),
    coalesce(sv.touched, 0),
    coalesce(sv.qualifying, 0),
    coalesce(dl.n, 0) >= min_downloads
      and coalesce(sv.qualifying, 0) >= min_surveys,
    is_current
      and (coalesce(dl.n, 0) < min_downloads
        or coalesce(sv.qualifying, 0) < min_surveys),
    -- Only whole blocks past the target pay. 79 downloads is one block, not
    -- one and a bit.
    (greatest(0, coalesce(dl.n, 0) - min_downloads) / bonus_per)::integer * bonus_amount,
    case
      when coalesce(dl.n, 0) >= min_downloads
       and coalesce(sv.qualifying, 0) >= min_surveys
      then stipend_amount
         + (greatest(0, coalesce(dl.n, 0) - min_downloads) / bonus_per)::integer * bonus_amount
      else 0
    end,
    coalesce(act.days, 0),
    coalesce(act.days, 0) < min_active
  from public.profiles p
  left join dl  on dl.aid  = p.id
  left join sv  on sv.aid  = p.id
  left join act on act.aid = p.id
  where p.role = 'ambassador' and p.status = 'active'
  order by coalesce(dl.n, 0) desc, p.full_name;
end;
$$;

revoke execute on function public.stipend_eligibility(date) from public, anon;
grant execute on function public.stipend_eligibility(date) to authenticated;

-- ─── The same picture, for the student whose month it is ────────────────────
drop function if exists public.my_stipend_progress(integer);

create or replace function public.my_stipend_progress(months_back integer default 6)
returns table (
  period             date,
  downloads          bigint,
  surveys            bigint,
  qualifying_surveys bigint,
  met                boolean,
  bonus_inr          integer,
  total_inr          integer,
  paid_status        text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me             uuid := auth.uid();
  min_downloads  integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_min_downloads'), 30);
  min_surveys    integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_min_surveys'), 2);
  min_responses  integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_min_responses_per_survey'), 10);
  bonus_per      integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_bonus_per_downloads'), 50);
  bonus_amount   integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_bonus_inr'), 500);
  stipend_amount integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_amount_inr'), 3000);
  span           integer := greatest(1, least(coalesce(months_back, 6), 24));
begin
  if me is null then
    return;
  end if;

  return query
  -- generate_series rather than the months that happen to have data: a month
  -- where someone did nothing is exactly the month they need to see.
  with periods as (
    select (date_trunc('month', now()) - (n || ' months')::interval)::date as p
    from generate_series(0, span - 1) as n
  ),
  dl as (
    select date_trunc('month', rc.converted_at)::date as p, count(*) as n
    from public.referral_conversions rc
    where rc.ambassador_id = me and rc.status = 'counted'
    group by 1
  ),
  per_survey as (
    select
      date_trunc('month', sr.submitted_at)::date as p,
      sr.survey_id as sid,
      count(*) as n
    from public.survey_responses sr
    where sr.ambassador_id = me and sr.status = 'valid'
    group by 1, 2
  ),
  sv as (
    select
      p,
      count(*) as touched,
      count(*) filter (where n >= min_responses) as qualifying
    from per_survey
    group by p
  ),
  pay as (
    select b.period_month as p, max(po.status::text) as st
    from public.payouts po
    join public.payout_batches b on b.id = po.batch_id
    where po.ambassador_id = me and po.kind = 'stipend' and b.period_month is not null
    group by 1
  )
  select
    periods.p,
    coalesce(dl.n, 0),
    coalesce(sv.touched, 0),
    coalesce(sv.qualifying, 0),
    coalesce(dl.n, 0) >= min_downloads
      and coalesce(sv.qualifying, 0) >= min_surveys,
    (greatest(0, coalesce(dl.n, 0) - min_downloads) / bonus_per)::integer * bonus_amount,
    case
      when coalesce(dl.n, 0) >= min_downloads
       and coalesce(sv.qualifying, 0) >= min_surveys
      then stipend_amount
         + (greatest(0, coalesce(dl.n, 0) - min_downloads) / bonus_per)::integer * bonus_amount
      else 0
    end,
    coalesce(pay.st, 'none')
  from periods
  left join dl  on dl.p  = periods.p
  left join sv  on sv.p  = periods.p
  left join pay on pay.p = periods.p
  order by periods.p desc;
end;
$$;

revoke execute on function public.my_stipend_progress(integer) from public, anon;
grant execute on function public.my_stipend_progress(integer) to authenticated;
