-- ─────────────────────────────────────────────────────────────────────────────
-- 0046 — The stipend counts surveys too
--
-- 0045 made a survey a task for the board and the student's own figure. The
-- stipend is the same rule addressed a third and fourth way, and it has to
-- move with them: the completion half of "80% and 15 downloads" must mean the
-- same thing on /admin/stipend as it does on /admin/analytics, or an admin
-- reads two percentages for one person and pays on the wrong one.
--
-- The survey bar is the one the student sees on the card, copied from
-- `surveyTargetFor`, same as 0045: participant → 1, a response_cap → the cap,
-- otherwise `stipend_min_responses_per_survey`.
--
-- Effect on the current month, measured before applying: 37 ambassadors clear
-- the 80% completion half today, 35 clear it once surveys are in the
-- denominator. Average completion moves from 69% to 66%.
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Per ambassador by construction: a survey is only theirs to do if a link
  -- was issued to them.
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

revoke execute on function public.stipend_eligibility(date) from public, anon;
grant execute on function public.stipend_eligibility(date) to authenticated;

comment on function public.stipend_eligibility(date) is
  'Stipend standing for every active ambassador in a month. Qualifying needs '
  'both halves: completion — campaign tasks and surveys together — at or '
  'above stipend_min_completion_pct, and counted downloads at or above '
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
  'The signed-in student''s own stipend standing, month by month. Same rule '
  'as stipend_eligibility — completion over campaign tasks and surveys, and '
  'downloads, both required.';
