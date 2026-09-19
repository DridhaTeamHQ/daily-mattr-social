-- ─────────────────────────────────────────────────────────────────────────────
-- 0049 — A student's board is their batch, with no exceptions
--
-- 0037 scoped the completion board to the viewer's batch and wrote the
-- fallback as:
--
--     b.viewer_unscoped
--     or b.viewer_batch is null          <-- this line
--     or p.batch = b.viewer_batch
--
-- That middle line means "an ambassador with no batch set sees everybody".
-- It reads like a sensible default and is the opposite of one. Batches start
-- in different months and are set different work, so a single ordering across
-- them ranks people against a denominator that was never theirs — which is
-- the whole reason the board is scoped in the first place. The fallback
-- switched that protection off for precisely the people it could not
-- identify.
--
-- Five active ambassadors have no batch today, and each of them was reading a
-- sixty-two row board with Batch A, B and D interleaved.
--
-- The fix is one operator. `is not distinct from` treats null as a value that
-- equals itself, so an ambassador with no batch is ranked against the other
-- ambassadors with no batch — a small board, but an honest one, and every row
-- on it was set the same work they were.
--
-- What is deliberately unchanged:
--
--   * `viewer_unscoped` still exempts an admin reading their own board. That
--     is /admin/leaderboard, which exists to compare batches against each
--     other and would be useless scoped to one.
--   * An admin previewing a student still gets the student's scoping, because
--     naming a viewer drops the exemption (0039). A preview that showed the
--     whole programme would be answering a different question.
--
-- Everything else about the function is identical to 0047, restated because
-- `create or replace` cannot take a body diff.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.completion_leaderboard(
  limit_count integer  default 200,
  viewer      uuid     default null,
  p_version   smallint default null
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
      coalesce(p_version, public.current_programme_version()) as run,
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
      and c.version = b.run
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
        -- `is not distinct from`, not `=`: null has to equal null here, so an
        -- ambassador with no batch is ranked against the others with no batch
        -- rather than against the whole programme. See the header.
        or p.batch is not distinct from b.viewer_batch
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
      and sv.version = b.run
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
      p_period_end   => b.period_end::timestamptz,
      p_version      => b.run::smallint
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

comment on function public.completion_leaderboard(integer, uuid, smallint) is
  'This month''s completion board for one run of the programme. A student '
  'always sees their own batch and only their own batch — including the '
  'batch of ambassadors who have none set, who are ranked together rather '
  'than against everybody. An admin reading their own board sees every '
  'batch; naming a viewer drops that exemption so a preview is scoped like '
  'the student being previewed.';
