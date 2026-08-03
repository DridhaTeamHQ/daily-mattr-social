-- ============================================================================
-- 0010 — Let trusted server code past the profile guard
-- ============================================================================
-- 0009's guard blocked the very code that needs to set `must_change_password`.
--
-- `guard_profile_privilege_columns` allows the write only when `is_admin()`,
-- which reads `auth.uid()`. The service-role client carries no JWT, so
-- `auth.uid()` is null, `is_admin()` is false, and the trigger raised on every
-- server-side write — creating an ambassador failed, and so did a student
-- finishing onboarding at /welcome.
--
-- A null `auth.uid()` can only mean service-role or direct SQL: `authenticated`
-- always has one, and `anon` has no UPDATE policy on profiles at all, so it
-- never reaches this trigger. Treating null as trusted is therefore not a
-- loosening of what a student can do.
-- ============================================================================

create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Server-side code holding the service-role key, or a migration.
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

  return new;
end;
$$;
