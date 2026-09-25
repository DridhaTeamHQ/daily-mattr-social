-- ─────────────────────────────────────────────────────────────────────────────
-- 0053 — A new run resets installs only; the work carries forward
--
-- 0047 made every counted thing start at nought in a new run. That turned out
-- to be more than was wanted: the campaigns, surveys and the proof students
-- filed against them are the programme's ongoing work, and a restart that
-- hides them means rebuilding it all. What has to start again is installs.
--
-- So opening a run now moves the ongoing work into it:
--
--   moved        campaigns, surveys (their tasks and links follow the parent),
--                submissions, survey_responses, achievements, badge_awards,
--                redemption_requests, and every point_ledger row except the
--                ones earned by installs.
--
--   left behind  referral_conversions and referral_clicks — the installs —
--                plus the ledger rows they produced (source_type
--                'referral_conversion' and 'referral_multiplier'), and
--                payouts / payout_batches, which are money already settled.
--
-- The result: the open run always holds the ongoing work, and each run keeps
-- only the installs recorded while it was open. Reading an earlier run in the
-- console shows its installs; its tasks and surveys are in the open run.
--
-- It is symmetric, so "Make current" on an earlier run moves the work back
-- with it and remains the undo it was before.
--
-- Uniqueness is safe: after a move the source run holds none of the moved
-- rows, so the per-run unique indexes on point_ledger and badge_awards cannot
-- collide in either direction.
--
-- ─── Two triggers learn about the move ─────────────────────────────────────
--
-- The ledger is append-only (0002), and changing which run a row counts in is
-- an update. The guard now lets exactly one update through: one that changes
-- nothing but `version`, made while `app.switching_run` is set. That flag is
-- set transaction-locally by the switch below and is not settable through the
-- API, so every other edit to the ledger is refused exactly as before.
--
-- `touch_updated_at` skips its stamp under the same flag. Moving a campaign
-- between runs is not an edit to it, and bumping `updated_at` on all of them
-- would reorder every "recently changed" list at once.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.point_ledger_forbid_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.switching_run', true), '') = 'on'
     -- `direction` is generated, so it is still null on NEW in a BEFORE
     -- trigger; it is derived from delta, which the comparison does cover.
     and (to_jsonb(new) - 'version' - 'direction')
       = (to_jsonb(old) - 'version' - 'direction')
  then
    return new;
  end if;

  raise exception 'point_ledger is append-only: correct mistakes with a compensating row, do not edit history';
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.switching_run', true), '') = 'on' then
    return new;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.switch_programme_version(
  p_to    smallint,
  p_actor uuid default null
)
returns smallint
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_from smallint := public.current_programme_version();
begin
  if not exists (select 1 from public.programme_versions where id = p_to) then
    raise exception 'There is no run %', p_to;
  end if;

  if v_from = p_to then
    return v_from;
  end if;

  perform set_config('app.switching_run', 'on', true);

  update public.campaigns           set version = p_to where version = v_from;
  update public.surveys             set version = p_to where version = v_from;
  update public.submissions         set version = p_to where version = v_from;
  update public.survey_responses    set version = p_to where version = v_from;
  update public.achievements        set version = p_to where version = v_from;
  update public.badge_awards        set version = p_to where version = v_from;
  update public.redemption_requests set version = p_to where version = v_from;

  update public.point_ledger
     set version = p_to
   where version = v_from
     and coalesce(source_type, '') not in ('referral_conversion', 'referral_multiplier');

  perform set_config('app.switching_run', '', true);

  insert into public.app_settings (key, value, updated_by)
  values ('active_programme_version', to_jsonb(p_to), p_actor)
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by;

  return v_from;
end;
$$;

comment on function public.switch_programme_version(smallint, uuid) is
  'Opens a run: moves campaigns, surveys, submissions, responses, badges, '
  'achievements, redemptions and non-install points into it, and points new '
  'work at it — in one transaction. Installs stay in the run they were '
  'recorded in. Returns the run that was open before.';

-- Server-side only: the admin actions call it with the service role after
-- their own admin check.
revoke execute on function public.switch_programme_version(smallint, uuid)
  from public, anon, authenticated;
grant execute on function public.switch_programme_version(smallint, uuid)
  to service_role;
