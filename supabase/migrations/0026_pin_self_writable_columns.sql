-- RLS can say "this row is yours". It cannot say "these columns of your row
-- are not yours to change". Both tables below granted a blanket UPDATE on the
-- owner's own row, so every column the app never intended to expose was
-- writable by anyone willing to POST to PostgREST instead of using the form.

-- ─── 1. Cohort keys were self-writable ──────────────────────────────────────
--
-- guard_profile_privilege_columns already pinned role, status, email,
-- referral_code and must_change_password. It was written before city, batch
-- and college existed and never caught up with them.
--
-- Those three are not cosmetic: they are what batch_standings, the
-- leaderboard's city/batch filters and every cohort breakdown group by. An
-- ambassador could move themselves into whichever batch they were most likely
-- to top, or out of a struggling college, and the standings would agree with
-- them. The suspension bookkeeping (status_reason and friends) is admin
-- workflow state and equally not theirs to edit — the durable record lives in
-- audit_log either way, but a blanked reason is still an admin misled.
--
-- Admins and service-role return early, exactly as before, so
-- updateAmbassadorSegments keeps working.
create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.role                 is distinct from old.role
     or new.status               is distinct from old.status
     or new.referral_code        is distinct from old.referral_code
     or new.email                is distinct from old.email
     or new.must_change_password is distinct from old.must_change_password
  then
    raise exception 'not allowed to modify role, status, email, referral_code or must_change_password';
  end if;

  -- Added: the grouping keys every cohort number is computed from, and the
  -- suspension bookkeeping an admin writes.
  if new.city               is distinct from old.city
     or new.batch              is distinct from old.batch
     or new.college            is distinct from old.college
     or new.joined_as          is distinct from old.joined_as
     or new.status_reason      is distinct from old.status_reason
     or new.status_changed_at  is distinct from old.status_changed_at
     or new.status_changed_by  is distinct from old.status_changed_by
  then
    raise exception 'city, batch, college and status history are set by an admin';
  end if;

  return new;
end;
$function$;

-- ─── 2. Notifications were rewritable by their recipient ────────────────────
--
-- `notifications_update_own` checks `profile_id = auth.uid()` and nothing
-- else, so the recipient could rewrite title, body, href and meta of a
-- notification they had been sent. The app only ever writes read_at
-- (notification-actions.ts), so nothing legitimate is lost by saying so.
--
-- The realistic abuse is small but real: a notification is trusted chrome, and
-- an href the user controls turns their own inbox into a place to park a link
-- that looks like it came from us — useful in a screenshot, or against a
-- shared device.
create or replace function public.guard_notification_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id
     or new.type    is distinct from old.type
     or new.title   is distinct from old.title
     or new.body    is distinct from old.body
     or new.href    is distinct from old.href
     or new.meta    is distinct from old.meta
     or new.created_at is distinct from old.created_at
  then
    raise exception 'only read_at may be changed on a notification';
  end if;

  return new;
end;
$function$;

drop trigger if exists notifications_guard_columns on public.notifications;
create trigger notifications_guard_columns
  before update on public.notifications
  for each row execute function public.guard_notification_columns();

-- ─── 3. window_start had a mutable search_path ──────────────────────────────
--
-- Not SECURITY DEFINER, so the blast radius is small, but it is called inside
-- leaderboard_window and my_standing_window which ARE definers — and Supabase's
-- own linter flags it. Pinning costs nothing.
create or replace function public.window_start(window_key text)
returns timestamp with time zone
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case lower(coalesce(window_key, 'all'))
    when 'day'   then date_trunc('day', now())
    when 'week'  then date_trunc('week', now())
    when 'month' then date_trunc('month', now())
    else '-infinity'::timestamptz
  end;
$function$;

-- ─── 4. active_days was readable by the anon role ───────────────────────────
--
-- The policy is written for `public`, which includes anon. In practice the
-- predicate saves it — `ambassador_id = auth.uid()` is NULL for an anonymous
-- caller and is_admin() is false, so no row matches — but a policy that
-- depends on its predicate rather than its role grant is one refactor away
-- from leaking. Say `authenticated`.
drop policy if exists active_days_self on public.active_days;
create policy active_days_self on public.active_days
  for select to authenticated
  using (ambassador_id = auth.uid() or public.is_admin());
