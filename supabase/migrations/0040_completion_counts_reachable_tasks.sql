-- ─────────────────────────────────────────────────────────────────────────────
-- 0040 — Completion counts only the tasks an ambassador could reach
--
-- Symptom: an ambassador who has finished every task on their Tasks page sits
-- at 69% and cannot move. Batch C, this month: 11 approved out of a
-- denominator of 16.
--
-- The five missing tasks are five near-duplicate "Take the Weekly Quiz"
-- campaigns, created and set live inside seven minutes on 22 Aug and ended by
-- hand on 25 Aug. The ambassador's account was created on 29 Aug — four days
-- after the last of them was ended. They were never on her Tasks page, they
-- cannot be submitted to, and there is nothing she can ever do about them.
--
-- Two separate faults put them in her denominator, and the fix needs both.
--
--   1. A manually ended campaign had no end stamp at all. `setCampaignStatus`
--      flips `status` and nothing else, so `ends_at` stays null — a deadline
--      the admin never typed. The task pool read that null through
--      `coalesce(c.ends_at, period_end)`, which says "no deadline, therefore
--      still running", and a campaign that stopped in August went on counting
--      through September. Only the auto-end sweep looked honest here, because
--      it can only close a campaign that had an `ends_at` to begin with.
--
--      So: `ended_at`, backfilled from `updated_at` for the rows already in
--      that state — the stamp the status change left behind, and the same one
--      /admin/analytics already reads for an ended campaign's end.
--
--      It is written by a trigger rather than by the actions that end a
--      campaign. There are already three paths into an end state — the End
--      button, the archive toggle, the deadline sweep — and the next one will
--      be written by somebody who has never read this migration. A trigger
--      cannot be forgotten by a caller; a field in an `update` can.
--
--   2. The pool was one set shared by everyone, regardless of who was a
--      member when. Even with an honest end stamp, someone who joins on the
--      20th is still charged for a campaign that ran and ended on the 5th of
--      the same month. The pool is now per ambassador, floored at the later
--      of (the month's start, the day they joined).
--
-- What still counts, on purpose: a campaign that started before someone
-- joined but is still open counts, because it is on their Tasks page and they
-- can do it. A campaign they did finish counts, whenever it ran.
--
-- `ambassador_completion` (0033) is the same arithmetic addressed by id and
-- must stay in step with the board — both are rewritten here.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── An end that a manual end actually records ──────────────────────────────

alter table public.campaigns
  add column if not exists ended_at timestamptz;

comment on column public.campaigns.ended_at is
  'When the campaign actually stopped accepting work, as opposed to ends_at, '
  'which is the deadline an admin typed and may be null or may never have '
  'been reached. Set when the status becomes ended or archived. Completion '
  'reads the earlier of the two: a campaign ended by hand on the 5th stopped '
  'on the 5th, whatever its deadline said.';

-- The rows that were already ended or archived before the column existed.
-- `updated_at` is the moment the status flip touched them; for anything ended
-- by the deadline sweep `ends_at` is the earlier and truer of the two, and the
-- functions below take the earlier of the pair anyway.
update public.campaigns
set ended_at = coalesce(ends_at, updated_at)
where status in ('ended', 'archived')
  and ended_at is null;

create or replace function public.stamp_campaign_end()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status in ('ended', 'archived') then
    -- Only the first time it enters an end state. Archiving a campaign that
    -- ended last week must not move its end to today, and the backfill above
    -- must survive this trigger firing over it.
    if new.ended_at is null then
      new.ended_at := now();
    end if;
  else
    -- Draft, or relaunched. Any stamp it carries describes a run that is no
    -- longer the current one.
    new.ended_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists campaigns_stamp_end on public.campaigns;

create trigger campaigns_stamp_end
  before insert or update on public.campaigns
  for each row execute function public.stamp_campaign_end();

-- ─── The board ──────────────────────────────────────────────────────────────

drop function if exists public.completion_leaderboard(integer, uuid);

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
  -- When each campaign stopped being something anyone could act on. A live
  -- campaign runs to its deadline, or to the end of the period if it has
  -- none. An ended or archived one stopped at the earlier of its deadline and
  -- the moment it was ended — 'infinity' stands in for a missing stamp so
  -- `least` ignores it rather than returning null.
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
      and c.starts_at < b.period_end::timestamptz
  ),
  members as (
    select
      p.id as ambassador_id,
      p.full_name,
      p.college,
      p.batch,
      -- The floor of this member's own pool: the month's start, pulled
      -- forward to their join date when they signed up after it began.
      greatest(b.period_start::timestamptz, p.created_at) as reachable_from
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
  -- Every (member, task) pair the member could reach, against their own
  -- approved submission for it if there is one. Counting this once gives both
  -- the total and the approved figure already scoped to that member, which is
  -- the whole point: the denominator is no longer one number for everybody.
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
      m.ambassador_id,
      m.full_name,
      m.college,
      m.batch,
      coalesce(cn.total_tasks, 0) as total_tasks,
      coalesce(cn.approved_tasks, 0) as approved_tasks,
      case
        when coalesce(cn.total_tasks, 0) = 0 then 0
        else least(100, round((coalesce(cn.approved_tasks, 0)::numeric * 100) / cn.total_tasks)::integer)
      end as completion_pct,
      coalesce(sp.total_seconds, 0) as time_up_seconds,
      -- Against the viewer, so the preview highlights the student's row and
      -- the page can read their batch and placing off it.
      m.ambassador_id = b.viewer_id as is_me
    from members m
    cross join bounds b
    left join counted cn on cn.ambassador_id = m.ambassador_id
    left join spent sp on sp.aid = m.ambassador_id
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
  'This month''s completion board, scoped to the viewer''s batch and, per '
  'ambassador, to the tasks they could actually reach — nothing that had '
  'already stopped before they joined. `viewer` names somebody else to answer '
  'about and is honoured only for an admin: it is how "view as ambassador" '
  'shows the student their own board rather than the admin''s unscoped one.';

-- ─── The same figure, for one ambassador ────────────────────────────────────

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
      (date_trunc('month', now()) + interval '1 month')::date as period_end,
      -- Same floor as the board's: the month's start, pulled forward to this
      -- ambassador's join date. The coalesce covers a `target` that names no
      -- profile; the guard at the end empties the result in that case anyway.
      greatest(
        date_trunc('month', now()),
        coalesce(
          (select p.created_at from public.profiles p where p.id = target),
          date_trunc('month', now())
        )
      ) as reachable_from
  ),
  -- Must stay identical to the board's `windows`. If the definition of "still
  -- reachable" changes there, change it here in the same migration, or the
  -- admin and the student start quoting different numbers at each other.
  task_pool as (
    select ct.id
    from public.campaign_tasks ct
    join public.campaigns c on c.id = ct.campaign_id
    cross join bounds b
    where c.status <> 'draft'
      and c.starts_at < b.period_end::timestamptz
      and case
        when c.status in ('ended', 'archived') then least(
          coalesce(c.ended_at, 'infinity'::timestamptz),
          coalesce(c.ends_at, 'infinity'::timestamptz)
        )
        else coalesce(c.ends_at, b.period_end::timestamptz)
      end >= b.reachable_from
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
  'This month''s task completion for one ambassador, by id, over the tasks '
  'they could reach since joining. Same arithmetic as completion_leaderboard, '
  'but unranked, uncapped, and not restricted to active profiles — so it is '
  'correct for a suspended ambassador and for anyone below the board''s limit.';

revoke all on function public.ambassador_completion(uuid) from public;
grant execute on function public.ambassador_completion(uuid) to authenticated;
