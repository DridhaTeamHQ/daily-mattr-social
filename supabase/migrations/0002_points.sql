-- ============================================================================
-- 0002 — Points ledger
-- ============================================================================
-- The ledger is append-only and it is the single source of truth for what an
-- ambassador has earned. There is no `points` column on `profiles` to drift
-- out of sync — a balance is always SUM(delta).
--
-- This matters because we auto-approve screenshots. When fraud surfaces a week
-- later we reverse it with a compensating negative row, which keeps the history
-- of what we believed and when. Nothing is ever edited or deleted.
-- ============================================================================

create type ledger_reason as enum (
  'survey_response',   -- someone completed an ambassador's survey link
  'instagram_task',    -- a screenshot was approved
  'referral',          -- an app download was confirmed
  'manual_adjust',     -- an admin granted or removed points by hand
  'revoke'             -- a previously credited item was reversed
);

create table public.point_ledger (
  id            bigserial primary key,
  ambassador_id uuid          not null references public.profiles (id) on delete cascade,
  delta         integer       not null,
  reason        ledger_reason not null,

  -- What caused this entry. Nullable for manual adjustments.
  source_type   text,
  source_id     text,

  note          text,
  created_by    uuid          references public.profiles (id) on delete set null,
  created_at    timestamptz   not null default now(),

  constraint point_ledger_delta_nonzero check (delta <> 0),
  constraint point_ledger_source_pairing check (
    (source_type is null and source_id is null)
    or (source_type is not null and source_id is not null)
  )
);

-- +1 for a credit, -1 for a reversal.
alter table public.point_ledger
  add column direction smallint generated always as (sign(delta)) stored;

-- The idempotency guarantee: at most one credit and at most one reversal per
-- source. A retried webhook, a double-clicked approve button, or a re-imported
-- CSV row cannot pay a student twice.
create unique index point_ledger_source_direction_key
  on public.point_ledger (source_type, source_id, direction)
  where source_id is not null;

create index point_ledger_ambassador_idx on public.point_ledger (ambassador_id, created_at desc);

-- ─── Immutability ───────────────────────────────────────────────────────────

create or replace function public.point_ledger_forbid_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'point_ledger is append-only: correct mistakes with a compensating row, do not edit history';
end;
$$;

create trigger point_ledger_no_update
  before update on public.point_ledger
  for each row execute function public.point_ledger_forbid_update();

-- Deletes are blocked too, with one carve-out: when a profile is deleted, the
-- FK cascade legitimately removes that ambassador's rows. During a cascade the
-- parent is already gone, which is how we tell the two cases apart.
create or replace function public.point_ledger_forbid_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where id = old.ambassador_id) then
    raise exception 'point_ledger is append-only: reverse an entry with a negative row instead of deleting it';
  end if;
  return old;  -- cascading delete of the owning profile
end;
$$;

create trigger point_ledger_no_delete
  before delete on public.point_ledger
  for each row execute function public.point_ledger_forbid_delete();

-- ─── Reads ──────────────────────────────────────────────────────────────────

create or replace function public.ambassador_points(target uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)::integer
  from public.point_ledger
  where ambassador_id = target;
$$;

-- The leaderboard is deliberately a function, not a view. Ambassadors need to
-- see each other's names and scores but must never see each other's email,
-- phone or college contact details — a SECURITY DEFINER function lets us
-- expose exactly those columns and nothing more.
create or replace function public.leaderboard(limit_count integer default 100)
returns table (
  "position"    bigint,
  ambassador_id uuid,
  full_name     text,
  college       text,
  points        integer,
  is_me         boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select
      p.id,
      p.full_name,
      p.college,
      coalesce(sum(l.delta), 0)::integer as points
    from public.profiles p
    left join public.point_ledger l on l.ambassador_id = p.id
    where p.role = 'ambassador'
      and p.status = 'active'
    group by p.id, p.full_name, p.college
  )
  select
    rank() over (order by totals.points desc),
    totals.id,
    totals.full_name,
    totals.college,
    totals.points,
    totals.id = auth.uid()
  from totals
  order by totals.points desc, totals.full_name asc
  limit greatest(1, least(limit_count, 500));
$$;

-- Caller's own standing. Returns rank even when they're outside the top N.
create or replace function public.my_standing()
returns table (points integer, "position" bigint, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select
      p.id,
      coalesce(sum(l.delta), 0)::integer as pts
    from public.profiles p
    left join public.point_ledger l on l.ambassador_id = p.id
    where p.role = 'ambassador'
      and p.status = 'active'
    group by p.id
  ),
  -- 'position' is a reserved word in Postgres, so the rank column is aliased
  -- 'pos' here and only quoted in the RETURNS TABLE signature above.
  ranked as (
    select totals.id, totals.pts, rank() over (order by totals.pts desc) as pos from totals
  )
  select
    coalesce((select ranked.pts from ranked where ranked.id = auth.uid()), 0),
    coalesce((select ranked.pos from ranked where ranked.id = auth.uid()), 0::bigint),
    (select count(*) from ranked);
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.point_ledger enable row level security;

-- Read-only for students, and only their own history. There is deliberately no
-- INSERT/UPDATE/DELETE policy for `authenticated` — every write goes through
-- server code holding the service-role key, so the client can never mint points.
create policy point_ledger_select_own on public.point_ledger
  for select to authenticated
  using (ambassador_id = auth.uid());

create policy point_ledger_select_admin on public.point_ledger
  for select to authenticated
  using (public.is_admin());
