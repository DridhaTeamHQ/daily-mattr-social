-- ============================================================================
-- 0034 — Serialize survey admission decisions
-- ============================================================================
-- A response-cap check, participant duplicate check, IP-window check and the
-- response INSERT must be one database transaction. Separate application
-- queries can all observe the same pre-insert state when requests overlap.
--
-- Locking the survey row makes the critical section per-survey: unrelated
-- surveys still accept responses concurrently, while submissions to the same
-- survey take turns for the few statements that decide whether a row counts.
-- ============================================================================

create or replace function public.submit_survey_response_atomic(
  p_survey_link_id uuid,
  p_participant_user_id uuid,
  p_respondent_name text,
  p_respondent_email text,
  p_respondent_phone text,
  p_ip_hash text,
  p_user_agent text,
  p_ip_window_minutes integer
)
returns table (
  outcome text,
  response_id uuid,
  response_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey_id uuid;
  v_ambassador_id uuid;
  v_survey_status text;
  v_audience text;
  v_response_cap integer;
  v_valid_count bigint;
  v_response_id uuid;
begin
  -- This row lock is the concurrency boundary for every admission decision
  -- below. It is released automatically when this function's transaction ends.
  select
    link.survey_id,
    link.ambassador_id,
    survey.status::text,
    survey.audience::text,
    survey.response_cap
  into
    v_survey_id,
    v_ambassador_id,
    v_survey_status,
    v_audience,
    v_response_cap
  from public.survey_links as link
  join public.surveys as survey on survey.id = link.survey_id
  where link.id = p_survey_link_id
  for update of survey;

  if not found then
    return query select 'not_found', null::uuid, null::text;
    return;
  end if;

  if v_survey_status <> 'live' then
    return query select 'closed', null::uuid, null::text;
    return;
  end if;

  if v_audience = 'participant' then
    if p_participant_user_id is null
      or p_participant_user_id <> v_ambassador_id then
      return query select 'participant_forbidden', null::uuid, null::text;
      return;
    end if;

    if exists (
      select 1
      from public.survey_responses as response
      where response.survey_link_id = p_survey_link_id
    ) then
      return query select 'participant_duplicate', null::uuid, null::text;
      return;
    end if;
  elsif v_response_cap is not null then
    select count(*)
    into v_valid_count
    from public.survey_responses as response
    where response.survey_id = v_survey_id
      and response.status = 'valid';

    if v_valid_count >= v_response_cap then
      return query select 'cap_reached', null::uuid, null::text;
      return;
    end if;
  end if;

  if p_ip_hash is not null and exists (
    select 1
    from public.survey_responses as response
    where response.survey_id = v_survey_id
      and response.ip_hash = p_ip_hash
      and response.status = 'valid'
      and response.submitted_at >=
        clock_timestamp() - make_interval(mins => greatest(p_ip_window_minutes, 1))
  ) then
    insert into public.survey_responses (
      survey_link_id,
      survey_id,
      ambassador_id,
      respondent_name,
      respondent_email,
      respondent_phone,
      ip_hash,
      user_agent,
      status,
      flag_reason
    ) values (
      p_survey_link_id,
      v_survey_id,
      v_ambassador_id,
      nullif(p_respondent_name, ''),
      nullif(p_respondent_email, ''),
      nullif(p_respondent_phone, ''),
      p_ip_hash,
      p_user_agent,
      'duplicate',
      format(
        'Another response came from the same network within %s minutes',
        greatest(p_ip_window_minutes, 1)
      )
    )
    returning id into v_response_id;

    return query select 'ip_duplicate', v_response_id, 'duplicate';
    return;
  end if;

  begin
    insert into public.survey_responses (
      survey_link_id,
      survey_id,
      ambassador_id,
      respondent_name,
      respondent_email,
      respondent_phone,
      ip_hash,
      user_agent,
      status
    ) values (
      p_survey_link_id,
      v_survey_id,
      v_ambassador_id,
      nullif(p_respondent_name, ''),
      nullif(p_respondent_email, ''),
      nullif(p_respondent_phone, ''),
      p_ip_hash,
      p_user_agent,
      'valid'
    )
    returning id into v_response_id;
  exception
    when unique_violation then
      -- Existing partial unique indexes remain the final identity guarantee.
      return query select 'identity_duplicate', null::uuid, null::text;
      return;
  end;

  -- Close at the cap while the same survey lock is still held. Even if the UI
  -- has not refreshed yet, the next transaction sees either closed or full.
  if v_audience = 'public' and v_response_cap is not null then
    select count(*)
    into v_valid_count
    from public.survey_responses as response
    where response.survey_id = v_survey_id
      and response.status = 'valid';

    if v_valid_count >= v_response_cap then
      update public.surveys
      set status = 'closed'
      where id = v_survey_id and status = 'live';
    end if;
  end if;

  return query select 'accepted', v_response_id, 'valid';
end;
$$;

revoke all on function public.submit_survey_response_atomic(
  uuid, uuid, text, text, text, text, text, integer
) from public, anon, authenticated;

grant execute on function public.submit_survey_response_atomic(
  uuid, uuid, text, text, text, text, text, integer
) to service_role;

comment on function public.submit_survey_response_atomic(
  uuid, uuid, text, text, text, text, text, integer
) is 'Atomically enforces participant uniqueness, public response caps, and the IP duplicate window before inserting a survey response.';
