-- ============================================================================
-- 0029 - Rank ambassadors by approved-task completion for the current month
-- ============================================================================

create or replace function public.completion_leaderboard(limit_count integer default 200)
returns table (
  position         integer,
  ambassador_id    uuid,
  full_name        text,
  college          text,
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
  with bounds as (
    select
      date_trunc('month', now())::date as period_start,
      (date_trunc('month', now()) + interval '1 month')::date as period_end,
      auth.uid() as viewer_id
  ),
  task_pool as (
    select ct.id
    from public.campaign_tasks ct
    join public.campaigns c on c.id = ct.campaign_id
    cross join bounds b
    where c.status <> 'draft'
      and c.starts_at < b.period_end::timestamptz
      and coalesce(c.ends_at, b.period_end::timestamptz) >= b.period_start::timestamptz
  ),
  task_total as (
    select count(*)::integer as total_tasks from task_pool
  ),
  approved as (
    select
      s.ambassador_id,
      count(distinct s.campaign_task_id)::integer as approved_tasks
    from public.submissions s
    join task_pool tp on tp.id = s.campaign_task_id
    where s.status in ('approved', 'auto_approved')
    group by s.ambassador_id
  ),
  progress as (
    select
      p.id as ambassador_id,
      p.full_name,
      p.college,
      tt.total_tasks,
      coalesce(a.approved_tasks, 0) as approved_tasks,
      case
        when tt.total_tasks = 0 then 0
        else least(100, round((coalesce(a.approved_tasks, 0)::numeric * 100) / tt.total_tasks)::integer)
      end as completion_pct,
      p.id = b.viewer_id as is_me
    from public.profiles p
    cross join task_total tt
    cross join bounds b
    left join approved a on a.ambassador_id = p.id
    where p.role = 'ambassador' and p.status = 'active'
  ),
  ranked as (
    select
      rank() over (order by completion_pct desc, approved_tasks desc) as position,
      *
    from progress
  )
  select
    position::integer,
    ambassador_id,
    full_name,
    college,
    total_tasks,
    approved_tasks,
    completion_pct,
    is_me
  from ranked
  order by completion_pct desc, approved_tasks desc, full_name
  limit greatest(1, least(coalesce(limit_count, 200), 1000));
$$;

revoke execute on function public.completion_leaderboard(integer) from public, anon;
grant execute on function public.completion_leaderboard(integer) to authenticated;
