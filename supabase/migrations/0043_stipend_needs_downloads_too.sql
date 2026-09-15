-- ─────────────────────────────────────────────────────────────────────────────
-- 0043 — The stipend needs downloads as well as completion
--
-- 0028 made the stipend a single test: approved tasks / tasks given >= 80%.
-- The programme now asks for both halves of the job — the content *and* the
-- installs it was supposed to drive:
--
--   completion >= 80%  AND  counted downloads >= 15
--
-- Both, not either. An ambassador who posts everything and refers nobody has
-- done half the work, and so has one who refers thirty people and posts
-- nothing; the old rule paid the first in full and the second not at all.
--
-- Downloads are counted the way 0015 counted them before completion replaced
-- it: `referral_conversions` rows with status 'counted' whose `converted_at`
-- falls inside the month. A voided conversion is one the programme decided not
-- to credit, so it is not a download here either.
--
-- `stipend_eligibility` (the admin board and what payout batches are built
-- from) and `my_stipend_progress` (what the student sees) are the same rule
-- addressed two ways and are rewritten together. If they disagree, an
-- ambassador is told they qualified and then not paid.
--
-- Both thresholds stay in `app_settings`, so moving the bar is a row, not a
-- deploy. `stipend_min_downloads` was last used by 0015 with a default of 30;
-- it is seeded here at 15, which is the number that was actually asked for,
-- and the seed is unconditional because a stale 30 sitting in the table would
-- silently hold the bar at twice the intended height.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.app_settings (key, value, description)
values (
  'stipend_min_downloads',
  to_jsonb(15),
  'Counted downloads an ambassador needs in the month to qualify for the '
  'stipend, alongside stipend_min_completion_pct. Both are required.'
)
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description;

insert into public.app_settings (key, value, description)
values (
  'stipend_min_completion_pct',
  to_jsonb(80),
  'Approved-task completion an ambassador needs in the month to qualify for '
  'the stipend, alongside stipend_min_downloads. Both are required.'
)
on conflict (key) do update set description = excluded.description;

-- ─── The admin board ────────────────────────────────────────────────────────

drop function if exists public.stipend_eligibility(date);

create or replace function public.stipend_eligibility(period_start date)
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
  min_completion integer := coalesce((
    select value::text::integer
    from public.app_settings
    where key = 'stipend_min_completion_pct'
  ), 80);
  min_downloads integer := coalesce((
    select value::text::integer
    from public.app_settings
    where key = 'stipend_min_downloads'
  ), 15);
  stipend_amount integer := coalesce((
    select value::text::integer
    from public.app_settings
    where key = 'stipend_amount_inr'
  ), 3000);
  window_days integer := coalesce((
    select value::text::integer
    from public.app_settings
    where key = 'activity_window_days'
  ), 10);
  min_active integer := coalesce((
    select value::text::integer
    from public.app_settings
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
      and c.starts_at < period_end::timestamptz
      and coalesce(c.ends_at, period_end::timestamptz) >= period_start::timestamptz
  ),
  task_totals as (
    select count(*)::integer as total_tasks
    from task_pool
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
  dl as (
    select rc.ambassador_id as aid, count(*)::integer as downloads
    from public.referral_conversions rc
    where rc.status = 'counted'
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
      coalesce(tt.total_tasks, 0) as total_tasks,
      coalesce(a.approved_tasks, 0) as approved_tasks,
      case
        when coalesce(tt.total_tasks, 0) = 0 then 0
        else least(
          100,
          round((coalesce(a.approved_tasks, 0)::numeric * 100) / tt.total_tasks)::integer
        )
      end as completion_pct,
      coalesce(dl.downloads, 0) as downloads,
      coalesce(act.days, 0) as active_days
    from public.profiles p
    cross join task_totals tt
    left join approved a on a.aid = p.id
    left join dl on dl.aid = p.id
    left join act on act.aid = p.id
    where p.role = 'ambassador' and p.status = 'active'
  ),
  judged as (
    select
      progress.*,
      -- Both halves. `total_tasks > 0` keeps a month with nothing published
      -- from reading as 0% rather than as "no month yet".
      progress.total_tasks > 0
        and progress.completion_pct >= min_completion
        and progress.downloads >= min_downloads as met
    from progress
  )
  select
    judged.id,
    judged.full_name,
    judged.city,
    judged.batch,
    judged.total_tasks,
    judged.approved_tasks,
    judged.completion_pct,
    judged.downloads,
    judged.met,
    -- At risk only while the month is still running, and only for somebody
    -- who has started: on a closed month a shortfall is a miss, and chasing
    -- someone about it is chasing them about a month that is over.
    is_current
      and not judged.met
      and (judged.approved_tasks > 0 or judged.downloads > 0),
    case when judged.met then stipend_amount else 0 end,
    judged.active_days,
    judged.active_days < min_active
  from judged
  order by judged.completion_pct desc, judged.downloads desc, judged.full_name;
end;
$$;

revoke execute on function public.stipend_eligibility(date) from public, anon;
grant execute on function public.stipend_eligibility(date) to authenticated;

comment on function public.stipend_eligibility(date) is
  'Stipend standing for every active ambassador in a month. Qualifying needs '
  'both halves: approved-task completion at or above '
  'stipend_min_completion_pct, and counted downloads at or above '
  'stipend_min_downloads.';

-- ─── The same rule, for the student themselves ──────────────────────────────

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
  min_completion integer := coalesce((
    select value::text::integer
    from public.app_settings
    where key = 'stipend_min_completion_pct'
  ), 80);
  min_downloads integer := coalesce((
    select value::text::integer
    from public.app_settings
    where key = 'stipend_min_downloads'
  ), 15);
  stipend_amount integer := coalesce((
    select value::text::integer
    from public.app_settings
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
    select
      periods.p,
      count(ct.id)::integer as total_tasks
    from periods
    left join public.campaigns c
      on c.status <> 'draft'
     and c.starts_at < (periods.p + interval '1 month')::timestamptz
     and coalesce(c.ends_at, (periods.p + interval '1 month')::timestamptz) >= periods.p::timestamptz
    left join public.campaign_tasks ct on ct.campaign_id = c.id
    group by periods.p
  ),
  approved as (
    select
      periods.p,
      count(distinct s.campaign_task_id)::integer as approved_tasks
    from periods
    join public.campaigns c
      on c.status <> 'draft'
     and c.starts_at < (periods.p + interval '1 month')::timestamptz
     and coalesce(c.ends_at, (periods.p + interval '1 month')::timestamptz) >= periods.p::timestamptz
    join public.campaign_tasks ct on ct.campaign_id = c.id
    join public.submissions s on s.campaign_task_id = ct.id
    where s.ambassador_id = me
      and s.status in ('approved', 'auto_approved')
    group by periods.p
  ),
  dl as (
    select date_trunc('month', rc.converted_at)::date as p, count(*)::integer as downloads
    from public.referral_conversions rc
    where rc.ambassador_id = me and rc.status = 'counted'
    group by 1
  ),
  pay as (
    select b.period_month as p, max(po.status::text) as st
    from public.payouts po
    join public.payout_batches b on b.id = po.batch_id
    where po.ambassador_id = me and po.kind = 'stipend' and b.period_month is not null
    group by 1
  ),
  -- Computed once and reused. Spelling the percentage out three times, as
  -- 0028 did, is how the figure shown and the figure judged drift apart.
  monthly as (
    select
      periods.p,
      coalesce(task_totals.total_tasks, 0) as total_tasks,
      coalesce(approved.approved_tasks, 0) as approved_tasks,
      case
        when coalesce(task_totals.total_tasks, 0) = 0 then 0
        else least(
          100,
          round((coalesce(approved.approved_tasks, 0)::numeric * 100) / task_totals.total_tasks)::integer
        )
      end as completion_pct,
      coalesce(dl.downloads, 0) as downloads,
      coalesce(pay.st, 'none') as paid_status
    from periods
    left join task_totals on task_totals.p = periods.p
    left join approved on approved.p = periods.p
    left join dl on dl.p = periods.p
    left join pay on pay.p = periods.p
  ),
  judged as (
    select
      monthly.*,
      monthly.total_tasks > 0
        and monthly.completion_pct >= min_completion
        and monthly.downloads >= min_downloads as met
    from monthly
  )
  select
    judged.p,
    judged.total_tasks,
    judged.approved_tasks,
    judged.completion_pct,
    judged.downloads,
    judged.met,
    case when judged.met then stipend_amount else 0 end,
    judged.paid_status
  from judged
  order by judged.p desc;
end;
$$;

revoke execute on function public.my_stipend_progress(integer) from public, anon;
grant execute on function public.my_stipend_progress(integer) to authenticated;

comment on function public.my_stipend_progress(integer) is
  'The signed-in student''s own stipend standing, month by month. Same rule '
  'as stipend_eligibility — completion and downloads, both required — with no '
  'argument for whose progress to fetch, so there is nothing to tamper with.';
