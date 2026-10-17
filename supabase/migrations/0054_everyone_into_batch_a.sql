-- ─────────────────────────────────────────────────────────────────────────────
-- 0054 — Every ambassador starts again in Batch A; the old batches are kept
--
-- The programme is being restarted as one cohort. Batch B will be opened
-- later for new intake, so for now every ambassador — active, suspended, and
-- the six who never had a batch set — is in Batch A.
--
-- `profiles.batch` holds only the current batch, so overwriting it would lose
-- who was in which batch before. That is the part that must not be lost: it
-- is how the first run's batch-vs-batch numbers make sense. So the old value
-- is copied into `batch_history` first, one row per ambassador, and the move
-- is written to audit_log like any admin change.
--
-- What is deliberately unchanged:
--
--   * Referral codes. DMB05 stays DMB05 even though its holder is now in
--     Batch A. A code is the link a student has already shared; reissuing it
--     would silently stop attributing new installs to them. New Batch A
--     ambassadors are numbered after the highest DMA serial, so no collision.
--   * Status. Suspended ambassadors move batch but stay suspended.
--   * Every counted row (installs, submissions, points). None store a batch;
--     they hang off the ambassador, so nothing else needs rewriting.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.batch_history (
  id            bigint generated always as identity primary key,
  ambassador_id uuid not null references public.profiles(id) on delete cascade,
  old_batch     text,
  new_batch     text,
  reason        text not null,
  changed_at    timestamptz not null default now()
);

create index if not exists batch_history_ambassador_idx
  on public.batch_history (ambassador_id, changed_at desc);

alter table public.batch_history enable row level security;

revoke all on public.batch_history from anon, authenticated;
grant select on public.batch_history to authenticated;

drop policy if exists batch_history_admin_read on public.batch_history;
create policy batch_history_admin_read on public.batch_history
  for select to authenticated
  using (public.is_admin());

-- ─── Keep the old batch, then move ──────────────────────────────────────────
insert into public.batch_history (ambassador_id, old_batch, new_batch, reason)
select id, batch, 'Batch A', 'programme restart: everyone into Batch A'
from public.profiles
where role = 'ambassador'
  and batch is distinct from 'Batch A';

insert into public.audit_log (actor_id, action, entity_type, entity_id, meta)
select
  null,
  'batch.merge_all',
  'profiles',
  null,
  jsonb_build_object(
    'new_batch', 'Batch A',
    'moved', sum(n),
    'from', jsonb_object_agg(coalesce(old_batch, '(none)'), n)
  )
from (
  select old_batch, count(*) as n
  from public.batch_history
  where reason = 'programme restart: everyone into Batch A'
  group by old_batch
) g;

update public.profiles
set batch = 'Batch A'
where role = 'ambassador'
  and batch is distinct from 'Batch A';
