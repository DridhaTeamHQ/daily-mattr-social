-- ─────────────────────────────────────────────────────────────────────────────
-- 0059 — A temporary password works for 5 days
--
-- An ambassador's login email carries a temporary password. Until now it
-- worked forever, so an invite forwarded around a WhatsApp group, or sitting
-- in an inbox for a month, was still a way into the account.
--
-- Now every temporary password expires 5 days after it is issued. Signing in
-- with one after that lands on a "your link has expired" page instead of the
-- dashboard, and an admin pressing Send mail (or Reset password) issues a
-- fresh one with a fresh 5 days.
--
-- The clock lives on the profile, not on the welcome email row, because a
-- temporary password is issued from four places — Add ambassador, an import,
-- Send mail and Reset password — and only one of them writes that row.
-- Null means no expiry: everyone who has already chosen their own password.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists temp_password_expires_at timestamptz;

comment on column public.profiles.temp_password_expires_at is
  'When the admin-issued temporary password stops working. Null once they set their own.';

-- Everyone waiting on a temporary password today gets a full 5 days from
-- now, not from when they were invited — otherwise most of the current
-- invite list would be locked out the moment this ships, with no warning.
update public.profiles
set temp_password_expires_at = now() + interval '5 days'
where must_change_password
  and temp_password_expires_at is null;

-- The ambassador must not be able to push their own expiry back. Same guard
-- as 0026 with one more column pinned; admins and the service role still
-- return early.
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
     or new.temp_password_expires_at is distinct from old.temp_password_expires_at
  then
    raise exception 'not allowed to modify role, status, email, referral_code or password state';
  end if;

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
