-- ─────────────────────────────────────────────────────────────────────────────
-- 0039 — The completion leaderboard follows the viewer, not the caller
--
-- 0037 scoped the board to `auth.uid()`'s batch and exempted admins, which is
-- right for the two pages that existed then. It is wrong for the third: "view
-- as ambassador", where an admin loads the student's own screens to see what
-- the student sees.
--
-- During a preview the caller is still the admin, so the exemption fires and
-- the board comes back unscoped — every batch, ranked programme-wide. What an
-- admin previewing a Batch D student actually got was the top of Batch A, no
-- "You" badge anywhere on it (`is_me` compared against the admin's own id,
-- which is on no ambassador row), and a heading that read "Completion
-- Leaderboard" because the page derives the batch from the viewer's row and
-- there was not one. Three symptoms, one cause: the function was answering
-- about the wrong person.
--
-- So the function takes who to answer about. `viewer` null — every existing
-- caller — behaves exactly as before, which keeps /admin/leaderboard and the
-- admin ambassador page reading the whole programme. src/lib/view-as.ts is
-- the only thing that passes it.
--
-- Two rules, both enforced here rather than trusted from the caller:
--
--   * Only an admin may name somebody else. For anyone else the argument is
--     ignored, so a student calling the RPC by hand with a friend's id reads
--     precisely the board they already had.
--   * Naming somebody drops the admin exemption. An admin asking what a
--     student sees is asking for the student's scoping too — leaving the board
--     unscoped would answer a different question than the one the preview is
--     for.
--
-- Adding an argument means dropping and recreating: Postgres will not add a
-- parameter in place, and leaving the one-argument version behind would make
-- `completion_leaderboard(1000)` ambiguous between the two. Same return
-- columns, same grants.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.completion_leaderboard(integer);

create function public.completion_leaderboard(
  limit_count integer default 200,
  viewer      uuid    default null
)
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
  with subject as (
    select
      -- `viewer` is a request, not a fact. It survives only for an admin.
      case
        when coalesce(public.is_admin(), false) and viewer is not null
          then viewer
        else auth.uid()
      end as id,
      -- Unscoped is for an admin reading their own board — /admin/leaderboard,
      -- which exists to compare batches against each other. An admin who has
      -- named a viewer is previewing, and a preview must be scoped like the
      -- person being previewed.
      coalesce(public.is_admin(), false) and viewer is null as unscoped
  ),
  bounds as (
    select
      date_trunc('month', now())::date as period_start,
      (date_trunc('month', now()) + interval '1 month')::date as period_end,
      s.id as viewer_id,
      s.unscoped as viewer_unscoped,
      -- Scalar subquery rather than a join to profiles: this must return
      -- exactly one row even for a caller with no profile, or the cross join
      -- below would produce an empty board instead of an unscoped one.
      (select p.batch from public.profiles p where p.id = s.id) as viewer_batch
    from subject s
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
      -- Against the viewer, so the preview highlights the student's row and
      -- the page can read their batch and placing off it.
      p.id = b.viewer_id as is_me
    from public.profiles p
    cross join task_total tt
    cross join bounds b
    left join approved a on a.ambassador_id = p.id
    left join spent sp on sp.aid = p.id
    where p.role = 'ambassador'
      and p.status = 'active'
      and (
        b.viewer_unscoped
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

revoke execute on function public.completion_leaderboard(integer, uuid) from public, anon;
grant execute on function public.completion_leaderboard(integer, uuid) to authenticated;

comment on function public.completion_leaderboard(integer, uuid) is
  'This month''s completion board, scoped to the viewer''s batch. `viewer` '
  'names somebody else to answer about and is honoured only for an admin — it '
  'is how "view as ambassador" shows the student their own board rather than '
  'the admin''s unscoped one.';
