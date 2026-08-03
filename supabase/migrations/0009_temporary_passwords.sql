-- ============================================================================
-- 0009 — Admin-issued temporary passwords
-- ============================================================================
-- Invite emails need working SMTP. Supabase's built-in sender is rate limited
-- to a handful an hour and frequently doesn't deliver at all, which left
-- invited ambassadors stuck with no way in.
--
-- Instead: an admin creates the account with a temporary password and passes
-- it on however they already talk to that student. The student is forced to
-- pick their own password before they can use anything.
--
-- The account stays `invited` until they do, so a half-onboarded student can't
-- collect survey links or appear on the leaderboard.
-- ============================================================================

alter table public.profiles
  add column must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'Set when an admin issues a temporary password. Cleared once the student '
  'chooses their own, at which point they are activated.';

-- ─── Keep it out of a student's reach ───────────────────────────────────────

-- Without this a student could simply PATCH the flag to false and carry on
-- using the password their admin knows.
create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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

  return new;
end;
$$;
