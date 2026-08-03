-- ============================================================================
-- 0001 — Identity, roles, settings, audit
-- ============================================================================
-- Foundational objects everything else depends on. Notably `is_admin()`, which
-- is SECURITY DEFINER on purpose: every other table's admin policy calls it,
-- and if it ran under the caller's RLS it would recurse forever on `profiles`.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─── Enums ──────────────────────────────────────────────────────────────────

create type user_role   as enum ('admin', 'ambassador');
create type user_status as enum ('invited', 'active', 'suspended');

-- ─── Profiles ───────────────────────────────────────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text        not null default '',
  email         text        not null,
  phone         text,
  college       text,
  role          user_role   not null default 'ambassador',
  status        user_status not null default 'invited',
  referral_code text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_email_key         unique (email),
  constraint profiles_referral_code_key unique (referral_code)
);

create index profiles_role_status_idx on public.profiles (role, status);

comment on column public.profiles.referral_code is
  'Shown to students and typed by hand into the DailyMattr app. Ambiguous '
  'glyphs (0/O/1/I/L/U) are excluded from the alphabet.';

-- ─── Referral code generation ───────────────────────────────────────────────

-- Crockford-ish alphabet, mirrored in src/lib/utils.ts randomCode().
create or replace function public.gen_referral_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  attempt   int := 0;
begin
  loop
    candidate := 'DM';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (
      select 1 from public.profiles where referral_code = candidate
    );

    attempt := attempt + 1;
    if attempt > 50 then
      -- 30^6 ≈ 729M combinations; 50 collisions means something is very wrong.
      raise exception 'could not generate a unique referral code after % attempts', attempt;
    end if;
  end loop;

  return candidate;
end;
$$;

-- ─── Profile provisioning ───────────────────────────────────────────────────

-- Admins invite students via supabase.auth.admin.inviteUserByEmail(), passing
-- name/phone/college as user metadata. Creating the profile from a trigger
-- keeps auth.users and profiles atomic — no orphaned auth rows if the app
-- crashes between the two writes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, college, role, status, referral_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'college', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'ambassador'),
    -- An invited user has not set a password yet. They become 'active' when
    -- they accept. A user created with a password (the seed admin) is active
    -- immediately.
    case
      when new.encrypted_password is null or new.encrypted_password = ''
        then 'invited'::user_status
      else 'active'::user_status
    end,
    public.gen_referral_code()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── updated_at ─────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─── Authorization helpers ──────────────────────────────────────────────────

-- SECURITY DEFINER so it reads `profiles` without triggering that table's own
-- RLS policies. Without this, any policy referencing is_admin() deadlocks in
-- infinite recursion. search_path is pinned to defeat search-path hijacking.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

-- An ambassador who is suspended keeps their login but loses the ability to
-- earn. Checked wherever new work is submitted.
create or replace function public.is_active_ambassador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'ambassador'
      and status = 'active'
  );
$$;

revoke execute on function public.gen_referral_code() from anon, authenticated;

-- ─── Settings ───────────────────────────────────────────────────────────────

-- Point values and AI thresholds live here so tuning the program doesn't
-- require a redeploy.
create table public.app_settings (
  key         text primary key,
  value       jsonb       not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

create trigger app_settings_touch_updated_at
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

insert into public.app_settings (key, value, description) values
  ('points.survey_response',   '10'::jsonb,   'Points per valid survey response'),
  ('points.referral',          '100'::jsonb,  'Points per confirmed app download'),
  ('ai.auto_approve_min',      '0.85'::jsonb, 'Minimum AI confidence to auto-approve a screenshot'),
  ('ai.enabled',               'true'::jsonb, 'Run AI verification at all; when false everything goes to manual review'),
  ('submissions.max_attempts', '3'::jsonb,    'How many times an ambassador may resubmit a rejected task'),
  ('phash.reject_distance',    '6'::jsonb,    'Hamming distance at or below which two screenshots are treated as the same image');

-- ─── Audit log ──────────────────────────────────────────────────────────────

create table public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text        not null,
  entity_type text        not null,
  entity_id   text,
  meta        jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_created_at_idx  on public.audit_log (created_at desc);
create index audit_log_entity_idx      on public.audit_log (entity_type, entity_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.profiles     enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log    enable row level security;

-- A student sees only their own row.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

-- Students may edit their contact details, nothing else. Role, status and
-- referral_code are pinned by the trigger below rather than by column grants,
-- because RLS cannot express "these columns are immutable".
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_all_admin on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Belt and braces: even with the UPDATE policy above, a student cannot
-- promote themselves or un-suspend their account.
create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.role          is distinct from old.role
     or new.status        is distinct from old.status
     or new.referral_code is distinct from old.referral_code
     or new.email         is distinct from old.email
  then
    raise exception 'not allowed to modify role, status, email or referral_code';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privilege_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privilege_columns();

-- Settings are readable by any signed-in user (the ambassador UI shows "worth
-- 10 points"), writable only by admins.
create policy app_settings_select_all on public.app_settings
  for select to authenticated
  using (true);

create policy app_settings_write_admin on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The audit log is admin-read-only. Writes come from server code holding the
-- service-role key, which bypasses RLS entirely.
create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using (public.is_admin());
