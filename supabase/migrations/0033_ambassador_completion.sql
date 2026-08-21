-- ============================================================================
-- 0033 — completion for one ambassador
-- ============================================================================
-- The admin's ambassador page needs the same completion figure the student
-- sees on their own dashboard. The obvious way to get it is to call
-- `completion_leaderboard` and pick the matching row out of the result, and
-- that is wrong in two ways that both fail silently:
--
--   * The board ends at `limit greatest(1, least(limit_count, 1000))`. Ranked
--     by percentage descending, the rows that fall off the end are the lowest
--     scorers — so past the cap, the people whose progress most needs looking
--     at are exactly the ones who read as a confident 0%.
--
--   * The board is `where p.role = 'ambassador' and p.status = 'active'`. A
--     suspended ambassador is not on it at all. The admin detail page is
--     precisely where a suspended person gets opened, and "0%" for someone
--     with six of six approved is not a rounding error, it is a false record
--     shown at the moment someone is deciding whether to reinstate them.
--
-- So: the same arithmetic, addressed by id instead of ranked. The task pool,
-- the month boundary and the approved-task count are copied from
-- `completion_leaderboard` deliberately and must stay in step with it — if the
-- pool definition changes there, change it here in the same migration, or the
-- admin and the student start quoting different numbers at each other.
--
-- Ranking is not duplicated. A rank only means something relative to the
-- people being ranked, so the page reads it off the board when the ambassador
-- appears there and simply omits it when they do not.
-- ============================================================================

create or replace function public.ambassador_completion(target uuid)
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
      (date_trunc('month', now()) + interval '1 month')::date as period_end
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
    select count(distinct s.campaign_task_id)::integer as approved_tasks
    from public.submissions s
    join task_pool tp on tp.id = s.campaign_task_id
    where s.status in ('approved', 'auto_approved')
      and s.ambassador_id = target
  )
  select
    tt.total_tasks,
    coalesce(a.approved_tasks, 0),
    case
      when tt.total_tasks = 0 then 0
      else least(100, round((coalesce(a.approved_tasks, 0)::numeric * 100) / tt.total_tasks)::integer)
    end
  from task_total tt
  cross join approved a
  -- SECURITY DEFINER reads past RLS, so the guard is the function's own job:
  -- an admin may look at anyone, an ambassador only at themselves. Returning
  -- no rows rather than raising keeps this from becoming a way to probe which
  -- ids exist.
  where public.is_admin() or target = auth.uid();
$$;

comment on function public.ambassador_completion(uuid) is
  'This month''s task completion for one ambassador, by id. Same task pool and '
  'arithmetic as completion_leaderboard, but unranked, uncapped, and not '
  'restricted to active profiles — so it is correct for a suspended '
  'ambassador and for anyone below the board''s limit.';

revoke all on function public.ambassador_completion(uuid) from public;
grant execute on function public.ambassador_completion(uuid) to authenticated;
