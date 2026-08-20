-- ============================================================================
-- 0032 — "time up": turnaround as the leaderboard's tie-breaker
-- ============================================================================
-- The completion board ranks on approved-task percentage. Because every
-- ambassador is measured against the same pool of tasks, that percentage is a
-- coarse number: with ten tasks in the month there are only eleven possible
-- scores, so a cohort of any size produces piles of people sharing a rank. A
-- board where forty students are all "#1" is not a ranking.
--
-- The tie-break is turnaround — how long each ambassador took, measured from
-- the moment a task was posted to the moment they submitted proof for it.
-- Submitted, *not* approved: approval latency is the admin's queue, not the
-- student's effort, and ranking on it would punish whoever happened to upload
-- while the reviewer was asleep.
--
-- Two things this deliberately does NOT do:
--   * It never changes who is above whom on percentage. It is the third sort
--     key, so it only ever separates people who were already level.
--   * It is not returned to the client. `completion_leaderboard` keeps its
--     exact signature; the seconds are consumed inside the ORDER BY and never
--     leave the database. Nothing in the UI can render them by accident.
-- ============================================================================

-- ─── When was a task actually posted? ───────────────────────────────────────
-- Neither table recorded this. `campaign_tasks` had no timestamp at all, and
-- `campaigns` recorded when the row was *created*, which for a campaign
-- drafted on Monday and published on Friday is four days early. Both halves
-- are needed: a task added to an already-live campaign starts its own clock.

alter table public.campaigns
  add column if not exists published_at timestamptz;

comment on column public.campaigns.published_at is
  'First time this campaign went live. Stamped by trigger, never cleared — a '
  'campaign that ends and relaunches keeps its original publication moment.';

alter table public.campaign_tasks
  add column if not exists posted_at timestamptz;

comment on column public.campaign_tasks.posted_at is
  'When the admin added this task. The moment it became *answerable* is '
  'greatest(posted_at, campaigns.published_at, campaigns.starts_at) — see '
  'public.time_up().';

-- Backfill. Existing rows have no history to recover, so we use the best
-- proxy available and say so: a live campaign is treated as published at its
-- start, and its tasks as posted when the campaign row was written.
update public.campaigns
   set published_at = starts_at
 where published_at is null
   and status <> 'draft';

update public.campaign_tasks ct
   set posted_at = c.created_at
  from public.campaigns c
 where c.id = ct.campaign_id
   and ct.posted_at is null;

-- Any orphan the join above missed (it cannot happen through the FK, but a
-- NOT NULL that can fail on deploy is worse than a defensive coalesce).
update public.campaign_tasks set posted_at = now() where posted_at is null;

alter table public.campaign_tasks
  alter column posted_at set default now(),
  alter column posted_at set not null;

-- ─── Stamping publication ───────────────────────────────────────────────────
-- A trigger rather than a line in setCampaignStatus(): campaigns go live from
-- the status action, from the edit form, and from seed scripts, and a clock
-- that only starts down one of those paths is a clock that silently reads
-- zero for the others.

create or replace function public.stamp_campaign_published_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'draft' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_stamp_published_at on public.campaigns;
create trigger campaigns_stamp_published_at
  before insert or update on public.campaigns
  for each row execute function public.stamp_campaign_published_at();

-- ─── time_up() ──────────────────────────────────────────────────────────────
-- One row per (ambassador, task) they got credit for: when the task went out,
-- when they answered it, and the gap in seconds.
--
-- The arguments are all optional filters, so the same definition serves both
-- callers and cannot drift between them:
--
--   -- one task, one person
--   select seconds from public.time_up(:ambassador, :task);
--
--   -- everyone, for a period
--   select ambassador_id, sum(seconds)
--     from public.time_up(p_period_start => :from, p_period_end => :to)
--    group by 1;
--
-- Only submissions that earned credit count, and for a task retried after a
-- rejection the clock stops at the attempt that was actually accepted — the
-- earliest upload among the approved rows. Counting the rejected attempt would
-- reward uploading anything quickly; counting the latest would punish someone
-- for an attempt that was never used.
--
-- Internal. Execute is revoked from every client role below; the only caller
-- is completion_leaderboard(), which is SECURITY DEFINER and therefore runs
-- this as the owner. There is no route from the app to these numbers.

create or replace function public.time_up(
  p_ambassador_id    uuid        default null,
  p_campaign_task_id uuid        default null,
  p_period_start     timestamptz default null,
  p_period_end       timestamptz default null
)
returns table (
  ambassador_id    uuid,
  campaign_task_id uuid,
  posted_at        timestamptz,
  submitted_at     timestamptz,
  seconds          bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with credited as (
    select
      s.ambassador_id    as amb,
      s.campaign_task_id as task,
      min(s.uploaded_at) as answered_at
    from public.submissions s
    where s.status in ('approved', 'auto_approved')
      and (p_ambassador_id is null or s.ambassador_id = p_ambassador_id)
      and (p_campaign_task_id is null or s.campaign_task_id = p_campaign_task_id)
    group by s.ambassador_id, s.campaign_task_id
  )
  select
    cr.amb,
    cr.task,
    -- GREATEST ignores NULLs, so a campaign with no published_at (a draft that
    -- somehow slipped the filter) still yields a real timestamp.
    greatest(ct.posted_at, c.published_at, c.starts_at),
    cr.answered_at,
    -- Clamped at zero. A backfilled published_at is a guess, and a guess that
    -- lands after a real upload would otherwise hand out negative seconds —
    -- which, being smaller, would read as the fastest work in the cohort.
    greatest(
      0,
      extract(epoch from cr.answered_at - greatest(ct.posted_at, c.published_at, c.starts_at))
    )::bigint
  from credited cr
  join public.campaign_tasks ct on ct.id = cr.task
  join public.campaigns c on c.id = ct.campaign_id
  where c.status <> 'draft'
    -- Mirrors completion_leaderboard's task_pool: a campaign counts for a
    -- period if its window overlaps that period at all. Passing no bounds
    -- means "all time", which is what the single-task lookup wants.
    and (
      p_period_start is null
      or p_period_end is null
      or (
        c.starts_at < p_period_end
        and coalesce(c.ends_at, p_period_end) >= p_period_start
      )
    );
$$;

comment on function public.time_up(uuid, uuid, timestamptz, timestamptz) is
  'Internal. Turnaround per ambassador per task: posted -> submitted, in '
  'seconds. Tie-breaks completion_leaderboard(); never surfaced in the UI.';

revoke execute on function public.time_up(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- ─── The board, with the tie broken ─────────────────────────────────────────
-- Unchanged from 0029 except for `spent` and the two sort keys that use it.
-- The returned columns are identical, on purpose.

create or replace function public.completion_leaderboard(limit_count integer default 200)
-- `position` is quoted throughout: bare, Postgres parses it as the
-- `position(x in y)` function and the declaration is a syntax error.
returns table (
  "position"       integer,
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
    where p.role = 'ambassador' and p.status = 'active'
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
