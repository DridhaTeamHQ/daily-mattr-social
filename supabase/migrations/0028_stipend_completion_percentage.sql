-- ============================================================================
-- 0028 — Stipend eligibility from approved-task completion percentage
-- ============================================================================
-- The programme now pays the monthly stipend on task completion:
--
--   approved tasks / total tasks given that month >= 80%
--
-- "Given that month" is interpreted as campaign tasks from campaigns whose
-- live window overlaps the month. The same denominator applies to the whole
-- cohort, and each ambassador's numerator is the count of those tasks they
-- have an approved or auto-approved submission for.
-- ============================================================================

insert into public.app_settings (key, value) values
  ('stipend_min_completion_pct', to_jsonb(80))
on conflict (key) do update set value = excluded.value;

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
      coalesce(act.days, 0) as active_days
    from public.profiles p
    cross join task_totals tt
    left join approved a on a.aid = p.id
    left join act on act.aid = p.id
    where p.role = 'ambassador' and p.status = 'active'
  )
  select
    progress.id,
    progress.full_name,
    progress.city,
    progress.batch,
    progress.total_tasks,
    progress.approved_tasks,
    progress.completion_pct,
    progress.total_tasks > 0 and progress.completion_pct >= min_completion,
    is_current
      and progress.total_tasks > 0
      and progress.approved_tasks > 0
      and progress.completion_pct < min_completion,
    case
      when progress.total_tasks > 0 and progress.completion_pct >= min_completion
      then stipend_amount
      else 0
    end,
    progress.active_days,
    progress.active_days < min_active
  from progress
  order by progress.completion_pct desc, progress.approved_tasks desc, progress.full_name;
end;
$$;

revoke execute on function public.stipend_eligibility(date) from public, anon;
grant execute on function public.stipend_eligibility(date) to authenticated;

drop function if exists public.my_stipend_progress(integer);

create or replace function public.my_stipend_progress(months_back integer default 6)
returns table (
  period          date,
  total_tasks     integer,
  approved_tasks  integer,
  completion_pct  integer,
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
  pay as (
    select b.period_month as p, max(po.status::text) as st
    from public.payouts po
    join public.payout_batches b on b.id = po.batch_id
    where po.ambassador_id = me and po.kind = 'stipend' and b.period_month is not null
    group by 1
  )
  select
    periods.p,
    coalesce(task_totals.total_tasks, 0),
    coalesce(approved.approved_tasks, 0),
    case
      when coalesce(task_totals.total_tasks, 0) = 0 then 0
      else least(
        100,
        round((coalesce(approved.approved_tasks, 0)::numeric * 100) / task_totals.total_tasks)::integer
      )
    end,
    coalesce(task_totals.total_tasks, 0) > 0
      and (
        case
          when coalesce(task_totals.total_tasks, 0) = 0 then 0
          else round((coalesce(approved.approved_tasks, 0)::numeric * 100) / task_totals.total_tasks)::integer
        end
      ) >= min_completion,
    case
      when coalesce(task_totals.total_tasks, 0) > 0
       and (
         case
           when coalesce(task_totals.total_tasks, 0) = 0 then 0
           else round((coalesce(approved.approved_tasks, 0)::numeric * 100) / task_totals.total_tasks)::integer
         end
       ) >= min_completion
      then stipend_amount
      else 0
    end,
    coalesce(pay.st, 'none')
  from periods
  left join task_totals on task_totals.p = periods.p
  left join approved on approved.p = periods.p
  left join pay on pay.p = periods.p
  order by periods.p desc;
end;
$$;

revoke execute on function public.my_stipend_progress(integer) from public, anon;
grant execute on function public.my_stipend_progress(integer) to authenticated;
