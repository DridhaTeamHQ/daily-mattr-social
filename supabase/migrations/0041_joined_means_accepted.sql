-- ─────────────────────────────────────────────────────────────────────────────
-- 0041 — "Joined" means the day they accepted, not the day they were invited
--
-- 0040 made the task pool per ambassador, floored at `profiles.created_at`.
-- That row is written by the `on_auth_user_created` trigger the moment an
-- admin sends the invite, so it dates the admin's work, not the student's. A
-- batch invited on the 7th and opened on the 13th all reads as the 7th, and
-- six days of campaigns they never saw are charged to them.
--
-- So: `activated_at`, the moment the account stopped being an unopened invite
-- — set where `status` becomes `active`, which is exactly the two places a
-- student sets their password (/welcome and /reset-password). Completion
-- floors on `coalesce(activated_at, created_at)`: an invite nobody has opened
-- has no acceptance to read, and the invite date is the only date it has.
--
-- Backfilled from the earliest row in `auth.sessions`, which is the first
-- sign-in Supabase still holds. Sessions are pruned on sign-out and expiry, so
-- for some accounts the earliest surviving session is later than the real
-- acceptance, and for a couple there is none at all — those fall back to
-- `created_at`, which is where they already were. The backfill can only move
-- somebody later than their invite, and only onto a day they demonstrably had
-- a session.
--
-- Written by a trigger, not by the two actions, for the reason 0040 gave for
-- `ended_at`: a caller can forget a field, a trigger cannot.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists activated_at timestamptz;

comment on column public.profiles.activated_at is
  'When the student accepted their invite and set a password, as opposed to '
  'created_at, which is when an admin sent it. Null while the invite is '
  'unopened. Set once, on the first transition into active, and never moved '
  'again — a suspension and a reinstatement do not restart their membership. '
  'Completion floors each ambassador''s task pool at coalesce(activated_at, '
  'created_at).';

-- Every account that has ever signed in, at the earliest session Supabase
-- still holds for it. `least` guards the impossible case of a session stamped
-- before the profile row it belongs to.
update public.profiles p
set activated_at = greatest(p.created_at, least(now(), s.first_session))
from (
  select user_id, min(created_at) as first_session
  from auth.sessions
  group by user_id
) s
where s.user_id = p.id
  and p.activated_at is null;

-- Anyone already past the invite whose sessions have all been pruned. This
-- lands them back on the invite date they were being measured from before
-- this migration, which is the only stamp left for them.
update public.profiles p
set activated_at = p.created_at
where p.activated_at is null
  and p.status in ('active', 'suspended');

create or replace function public.stamp_profile_activation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Only the first time. A reinstated ambassador kept their history while
  -- they were suspended; moving their start to the day the suspension lifted
  -- would hand them a fresh, shorter denominator.
  if new.status = 'active' and new.activated_at is null then
    new.activated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_stamp_activation on public.profiles;

-- `before`, so it also overwrites whatever an update tried to put in the
-- column: `activated_at` is derived from status, and 0026 did not pin it as
-- something an ambassador may write to their own row.
create trigger profiles_stamp_activation
  before insert or update on public.profiles
  for each row execute function public.stamp_profile_activation();

-- ─── The board, floored on acceptance ───────────────────────────────────────
--
-- Identical to 0040 apart from `members.reachable_from`, and repeated in full
-- because `create or replace` cannot restate a function's result columns.

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
    -- `viewer` is a request, not a fact. It survives only for an admin.
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
      (select p.batch from public.profiles p where p.id = s.id) as viewer_batch
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
      -- The floor of this member's own pool: the month's start, pulled
      -- forward to the day they accepted their invite.
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
  'already stopped before they accepted their invite. `viewer` names somebody '
  'else to answer about and is honoured only for an admin: it is how "view as '
  'ambassador" shows the student their own board rather than the admin''s '
  'unscoped one.';

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
      -- Same floor as the board's: the month's start, pulled forward to the
      -- day this ambassador accepted. The coalesce covers a `target` that
      -- names no profile; the guard at the end empties the result anyway.
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
  -- an admin may look at anyone, an ambassador only at themselves.
  where public.is_admin() or target = auth.uid();
$$;

comment on function public.ambassador_completion(uuid) is
  'This month''s task completion for one ambassador, by id, over the tasks '
  'they could reach since accepting their invite. Same arithmetic as '
  'completion_leaderboard, but unranked, uncapped, and not restricted to '
  'active profiles — so it is correct for a suspended ambassador and for '
  'anyone below the board''s limit.';

revoke all on function public.ambassador_completion(uuid) from public;
grant execute on function public.ambassador_completion(uuid) to authenticated;
