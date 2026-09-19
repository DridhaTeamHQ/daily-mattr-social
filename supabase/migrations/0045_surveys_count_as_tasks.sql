-- ─────────────────────────────────────────────────────────────────────────────
-- 0045 — A survey is a task
--
-- The student's Tasks page has always listed campaigns and surveys in one
-- feed, because that is what the month asks of them. Every completion figure
-- counted only the campaigns. So an ambassador previewing as Sai Srinivas
-- counts thirteen cards on his page while /admin/analytics says his total is
-- eleven, and both are right about different things.
--
-- One meaning of "task" from here: the campaign tasks in his pool, plus the
-- surveys he holds a link to. He is at 9 of 13 rather than 9 of 11.
--
-- ─── When a survey is done ──────────────────────────────────────────────────
--
-- Not on a single response — a survey is collection work, not a button. The
-- bar is the one the student already sees on the card, and it is copied from
-- `surveyTargetFor` in src/lib/queries.ts so the two cannot drift:
--
--   participant audience  → 1   (they answer it themselves, once)
--   a response_cap        → the cap
--   otherwise             → `stipend_min_responses_per_survey`, default 10
--
-- ─── When a survey is still reachable ───────────────────────────────────────
--
-- Same shape as campaigns, and the same trap: a closed survey records no
-- moment of closing, only `updated_at`, which any later edit moves. That is
-- precisely the bug 0040 found in campaigns and 0043 had to work around, so
-- `closed_at` is added here by a trigger before there is anything to
-- reconstruct — every survey in the table is live today, so this one is
-- correct from the first row that ever closes rather than backfilled from a
-- stamp that means something else.
--
-- All four functions move together. The board, the student's own figure, the
-- admin's payout page and the student's rewards page are one rule addressed
-- four ways; if they disagree, somebody is told they qualified and then not
-- paid.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.surveys
  add column if not exists closed_at timestamptz;

comment on column public.surveys.closed_at is
  'When the survey stopped accepting answers. Set by trigger on the first '
  'move into closed, cleared if it reopens. Completion reads it the way it '
  'reads campaigns.ended_at: a survey that shut before somebody joined was '
  'never theirs to do.';

create or replace function public.stamp_survey_close()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'closed' then
    -- Only the first time, so an edit to a survey closed last week does not
    -- move its closing to today.
    if new.closed_at is null then
      new.closed_at := now();
    end if;
  else
    -- Draft, or reopened. Any stamp it carries describes a run that is over.
    new.closed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists surveys_stamp_close on public.surveys;

create trigger surveys_stamp_close
  before insert or update on public.surveys
  for each row execute function public.stamp_survey_close();

-- ─── The board ──────────────────────────────────────────────────────────────

drop function if exists public.completion_leaderboard(integer, uuid);

create function public.completion_leaderboard(
  limit_count integer default 200,
  viewer      uuid    default null
)
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
      case
        when coalesce(public.is_admin(), false) and viewer is not null
          then viewer
        else auth.uid()
      end as id,
      coalesce(public.is_admin(), false) and viewer is null as unscoped
  ),
  bounds as (
    select
      date_trunc('month', now())::date as period_start,
      (date_trunc('month', now()) + interval '1 month')::date as period_end,
      s.id as viewer_id,
      s.unscoped as viewer_unscoped,
      (select p.batch from public.profiles p where p.id = s.id) as viewer_batch,
      coalesce((
        select value::text::integer
        from public.app_settings
        where key = 'stipend_min_responses_per_survey'
      ), 10) as min_responses
    from subject s
  ),
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
      greatest(
        b.period_start::timestamptz,
        coalesce(p.activated_at, p.created_at)
      ) as reachable_from
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
  -- One row per survey the member holds a link to and could still act on,
  -- with the answers they have gathered against the bar their card shows.
  survey_pool as (
    select
      m.ambassador_id,
      sv.id as survey_id,
      (
        select count(*)
        from public.survey_responses r
        where r.survey_id = sv.id
          and r.ambassador_id = m.ambassador_id
          and r.status = 'valid'
      ) as answers,
      case
        when sv.audience = 'participant' then 1
        when coalesce(sv.response_cap, 0) > 0 then sv.response_cap
        else b.min_responses
      end as needed
    from members m
    cross join bounds b
    join public.survey_links l on l.ambassador_id = m.ambassador_id
    join public.surveys sv on sv.id = l.survey_id
    where sv.status <> 'draft'
      and sv.created_at < b.period_end::timestamptz
      and (
        sv.status = 'live'
        or coalesce(sv.closed_at, 'infinity'::timestamptz) >= m.reachable_from
      )
  ),
  surveys_counted as (
    select
      ambassador_id,
      count(*)::integer as total_surveys,
      count(*) filter (where answers >= needed)::integer as done_surveys
    from survey_pool
    group by ambassador_id
  ),
  totals as (
    select
      m.ambassador_id,
      coalesce(cn.total_tasks, 0) + coalesce(sc.total_surveys, 0) as total_tasks,
      coalesce(cn.approved_tasks, 0) + coalesce(sc.done_surveys, 0) as approved_tasks
    from members m
    left join counted cn on cn.ambassador_id = m.ambassador_id
    left join surveys_counted sc on sc.ambassador_id = m.ambassador_id
  ),
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
      tt.total_tasks,
      tt.approved_tasks,
      case
        when tt.total_tasks = 0 then 0
        else least(100, round((tt.approved_tasks::numeric * 100) / tt.total_tasks)::integer)
      end as completion_pct,
      coalesce(sp.total_seconds, 0) as time_up_seconds,
      m.ambassador_id = b.viewer_id as is_me
    from members m
    cross join bounds b
    join totals tt on tt.ambassador_id = m.ambassador_id
    left join spent sp on sp.aid = m.ambassador_id
  ),
  ranked as (
    select
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
  order by completion_pct desc, approved_tasks desc, time_up_seconds asc, full_name
  limit greatest(1, least(coalesce(limit_count, 200), 1000));
$$;

revoke execute on function public.completion_leaderboard(integer, uuid) from public, anon;
grant execute on function public.completion_leaderboard(integer, uuid) to authenticated;

comment on function public.completion_leaderboard(integer, uuid) is
  'This month''s completion board, scoped to the viewer''s batch and, per '
  'ambassador, to the work they could actually reach — campaign tasks and '
  'surveys alike, and nothing that had already stopped before they accepted '
  'their invite.';

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
      greatest(
        date_trunc('month', now()),
        coalesce(
          (
            select coalesce(p.activated_at, p.created_at)
            from public.profiles p
            where p.id = target
          ),
          date_trunc('month', now())
        )
      ) as reachable_from,
      coalesce((
        select value::text::integer
        from public.app_settings
        where key = 'stipend_min_responses_per_survey'
      ), 10) as min_responses
  ),
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
  approved as (
    select count(distinct s.campaign_task_id)::integer as approved_tasks
    from public.submissions s
    join task_pool tp on tp.id = s.campaign_task_id
    where s.status in ('approved', 'auto_approved')
      and s.ambassador_id = target
  ),
  -- Must stay identical to the board's `survey_pool`. `needed` rather than
  -- `target`, which is this function's own argument.
  survey_pool as (
    select
      (
        select count(*)
        from public.survey_responses r
        where r.survey_id = sv.id
          and r.ambassador_id = target
          and r.status = 'valid'
      ) as answers,
      case
        when sv.audience = 'participant' then 1
        when coalesce(sv.response_cap, 0) > 0 then sv.response_cap
        else b.min_responses
      end as needed
    from public.survey_links l
    join public.surveys sv on sv.id = l.survey_id
    cross join bounds b
    where l.ambassador_id = target
      and sv.status <> 'draft'
      and sv.created_at < b.period_end::timestamptz
      and (
        sv.status = 'live'
        or coalesce(sv.closed_at, 'infinity'::timestamptz) >= b.reachable_from
      )
  ),
  tallied as (
    select
      (select count(*) from task_pool)::integer
        + (select count(*) from survey_pool)::integer as total_tasks,
      (select coalesce(approved.approved_tasks, 0) from approved)
        + (select count(*) from survey_pool where answers >= needed)::integer
        as approved_tasks
  )
  select
    tallied.total_tasks,
    tallied.approved_tasks,
    case
      when tallied.total_tasks = 0 then 0
      else least(100, round((tallied.approved_tasks::numeric * 100) / tallied.total_tasks)::integer)
    end
  from tallied
  where public.is_admin() or target = auth.uid();
$$;

comment on function public.ambassador_completion(uuid) is
  'This month''s completion for one ambassador — campaign tasks and surveys '
  'they could reach since accepting their invite. Same arithmetic as '
  'completion_leaderboard, but unranked and not restricted to active '
  'profiles.';

revoke all on function public.ambassador_completion(uuid) from public;
grant execute on function public.ambassador_completion(uuid) to authenticated;
