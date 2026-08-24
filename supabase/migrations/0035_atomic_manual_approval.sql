-- ============================================================================
-- 0035 — Make manual approval and its point credit one transaction
-- ============================================================================
-- Updating a submission and inserting its ledger credit as separate requests
-- can leave an approved submission unpaid. This function locks one submission
-- and performs both writes in the same transaction. Any failure rolls both
-- writes back, while the ledger's existing source/direction index keeps retries
-- and concurrent approvals from paying twice.
-- ============================================================================

create or replace function public.approve_submission_atomic(
  p_submission_id uuid,
  p_actor_id uuid,
  p_note text
)
returns table (
  outcome text,
  ambassador_id uuid,
  points integer,
  credited integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_ambassador_id uuid;
  v_points integer;
  v_ledger_id bigint;
begin
  select
    submission.status::text,
    submission.ambassador_id,
    task.points
  into v_status, v_ambassador_id, v_points
  from public.submissions as submission
  join public.campaign_tasks as task
    on task.id = submission.campaign_task_id
  where submission.id = p_submission_id
  for update of submission;

  if not found then
    return query select 'not_found', null::uuid, 0, 0;
    return;
  end if;

  -- Repair an approval created by the old two-request path if its credit is
  -- missing. Once repaired, future retries take the ordinary already branch.
  if v_status in ('approved', 'auto_approved') then
    if v_points > 0 and not exists (
      select 1
      from public.point_ledger as ledger
      where ledger.source_type = 'submission'
        and ledger.source_id = p_submission_id::text
        and ledger.direction = 1
    ) then
      insert into public.point_ledger (
        ambassador_id,
        delta,
        reason,
        source_type,
        source_id,
        note,
        created_by
      ) values (
        v_ambassador_id,
        v_points,
        'instagram_task',
        'submission',
        p_submission_id::text,
        coalesce(nullif(btrim(p_note), ''), 'Screenshot approved'),
        p_actor_id
      )
      on conflict do nothing
      returning id into v_ledger_id;

      return query select
        case when v_ledger_id is null then 'already' else 'repaired' end,
        v_ambassador_id,
        v_points,
        case when v_ledger_id is null then 0 else v_points end;
      return;
    end if;

    return query select 'already', v_ambassador_id, v_points, 0;
    return;
  end if;

  if v_points > 0 then
    insert into public.point_ledger (
      ambassador_id,
      delta,
      reason,
      source_type,
      source_id,
      note,
      created_by
    ) values (
      v_ambassador_id,
      v_points,
      'instagram_task',
      'submission',
      p_submission_id::text,
      coalesce(nullif(btrim(p_note), ''), 'Screenshot approved'),
      p_actor_id
    )
    on conflict do nothing
    returning id into v_ledger_id;
  end if;

  update public.submissions
  set
    status = 'approved',
    reviewer_id = p_actor_id,
    review_note = nullif(btrim(p_note), ''),
    reviewed_at = clock_timestamp(),
    reject_reason = null
  where id = p_submission_id;

  return query select
    'approved',
    v_ambassador_id,
    v_points,
    case when v_ledger_id is null then 0 else v_points end;
end;
$$;

revoke all on function public.approve_submission_atomic(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.approve_submission_atomic(uuid, uuid, text)
  to service_role;

comment on function public.approve_submission_atomic(uuid, uuid, text) is
  'Atomically approves one campaign submission and inserts its idempotent point credit; also repairs legacy approved-but-unpaid submissions when retried.';
