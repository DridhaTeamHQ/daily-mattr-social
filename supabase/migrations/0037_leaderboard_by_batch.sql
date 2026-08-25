-- ─────────────────────────────────────────────────────────────────────────────
-- 0037 — The completion leaderboard is a batch leaderboard
--
-- One board for the whole programme ranked a first-week ambassador against
-- someone three batches ahead of them, on tasks that went out before they
-- joined. An ambassador now sees their own batch and is ranked inside it, so
-- position 1 means first among the people who started when they did.
--
-- Admins are exempt: /admin/leaderboard reads this same function to compare
-- batches against each other, and scoping it to the admin's own batch would
-- quietly empty that page. An ambassador with no batch set is exempt too —
-- there is nothing to scope to, and showing them an empty board would be
-- worse than showing them everyone.
--
-- `batch` joins the returned columns; `college` stays, because the admin
-- board still searches on it. Adding a column means dropping and recreating
-- rather than replacing — Postgres will not change a function's OUT
-- parameters in place. Same name, same argument, same grants.
--
-- The ranking is computed after the filter, so positions run 1..n inside the
-- batch rather than being the programme-wide numbers with gaps in them.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.completion_leaderboard(integer);

create function public.completion_leaderboard(limit_count integer default 200)
-- `position` is quoted throughout: bare, Postgres parses it as the
-- `position(x in y)` function and the declaration is a syntax error.
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
  with bounds as (
    select
      date_trunc('month', now())::date as period_start,
      (date_trunc('month', now()) + interval '1 month')::date as period_end,
      auth.uid() as viewer_id,
      -- Scalar subquery rather than a join to profiles: this must return
      -- exactly one row even for a caller with no profile, or the cross join
      -- below would produce an empty board instead of an unscoped one.
      (select p.batch from public.profiles p where p.id = auth.uid()) as viewer_batch,
      coalesce(public.is_admin(), false) as viewer_is_admin
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
  -- Total seconds each ambassador spent on the tasks they got credit for this
  -- month. Someone with nothing approved has nothing to sum; they land on
  -- zero, which costs them nothing because they are tied at 0% anyway.
  spent as (
    select t.ambassador_id as aid, sum(t.seconds)::bigint as total_seconds
    from bounds b
    cross join lateral public.time_up(
      p_period_start => b.period_start::timestamptz,
      p_period_end   => b.period_end::timestamptz
    ) t
    group by t.ambassador_id
  ),
  progress as (
    select
      p.id as ambassador_id,
      p.full_name,
      p.college,
      p.batch,
      tt.total_tasks,
      coalesce(a.approved_tasks, 0) as approved_tasks,
      case
        when tt.total_tasks = 0 then 0
        else least(100, round((coalesce(a.approved_tasks, 0)::numeric * 100) / tt.total_tasks)::integer)
      end as completion_pct,
      coalesce(sp.total_seconds, 0) as time_up_seconds,
      p.id = b.viewer_id as is_me
    from public.profiles p
    cross join task_total tt
    cross join bounds b
    left join approved a on a.ambassador_id = p.id
    left join spent sp on sp.aid = p.id
    where p.role = 'ambassador'
      and p.status = 'active'
      and (
        b.viewer_is_admin
        or b.viewer_batch is null
        or p.batch = b.viewer_batch
      )
  ),
  ranked as (
    select
      -- Third key, and only ever a third key: two people separated by
      -- percentage are never reordered by how long they took.
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
  -- Must match the window's ORDER BY, or the rows come back in an order that
  -- disagrees with the numbers printed beside them.
  order by completion_pct desc, approved_tasks desc, time_up_seconds asc, full_name
  limit greatest(1, least(coalesce(limit_count, 200), 1000));
$$;

revoke execute on function public.completion_leaderboard(integer) from public, anon;
grant execute on function public.completion_leaderboard(integer) to authenticated;
