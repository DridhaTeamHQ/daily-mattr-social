-- ─────────────────────────────────────────────────────────────────────────────
-- 0057 — Suspended ambassadors are kept for 30 days, then deleted
--
-- Suspending somebody used to be indefinite. Their referral code stayed tied
-- up, and a slot that was never coming back sat in every list forever.
--
-- Now a suspension starts a 30-day clock:
--   · Everything they had is written to `suspended_ambassadors` — the profile
--     as it was, plus the totals an admin would want to see at a glance. The
--     live rows (points, downloads, submissions…) stay where they are, keyed to
--     their account, so reinstating them brings all of it back untouched.
--   · Their referral code is offered to the next person added. The new person
--     starts at zero: every download and point is stored against the account
--     that earned it, never against the code.
--   · Reinstated within 30 days: the archive row goes, and the app gives them a
--     fresh code (theirs may already be somebody else's).
--   · Not reinstated: the nightly purge deletes the login, which cascades to
--     the profile and every row hanging off it, this archive row included.
--
-- The archive is written by a trigger rather than by the app, so the single
-- suspend, the bulk suspend and anything done in the SQL editor all agree.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.suspended_ambassadors (
  ambassador_id       uuid        primary key references public.profiles (id) on delete cascade,

  -- Snapshot at the moment of suspension.
  email               text        not null,
  full_name           text        not null,
  phone               text,
  college             text,
  city                text,
  batch               text,
  referral_code       text        not null,
  points              integer     not null default 0,
  downloads           integer     not null default 0,
  approved_submissions integer    not null default 0,
  profile             jsonb       not null,
  reason              text,

  suspended_at        timestamptz not null default now(),
  suspended_by        uuid        references public.profiles (id) on delete set null,
  purge_after         timestamptz not null default now() + interval '30 days',

  -- Set once their code has been handed to somebody new, so it is offered
  -- exactly once.
  code_reassigned_to  uuid        references public.profiles (id) on delete set null,
  code_reassigned_at  timestamptz
);

create index if not exists suspended_ambassadors_purge_idx
  on public.suspended_ambassadors (purge_after);

alter table public.suspended_ambassadors enable row level security;

revoke all on public.suspended_ambassadors from anon, authenticated;
grant select on public.suspended_ambassadors to authenticated;

drop policy if exists suspended_ambassadors_admin_read on public.suspended_ambassadors;
create policy suspended_ambassadors_admin_read on public.suspended_ambassadors
  for select to authenticated
  using (public.is_admin());

-- ─── Snapshot ───────────────────────────────────────────────────────────────

-- `starts_at` is when the 30 days start counting, which is not always the day
-- they were suspended — see the backfill at the bottom.
create or replace function public.archive_suspended_ambassador(
  target uuid,
  starts_at timestamptz default now()
)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  insert into public.suspended_ambassadors (
    ambassador_id, email, full_name, phone, college, city, batch,
    referral_code, points, downloads, approved_submissions, profile, reason,
    suspended_at, suspended_by, purge_after
  )
  select
    p.id, p.email, p.full_name, p.phone, p.college, p.city, p.batch,
    p.referral_code,
    public.ambassador_points(p.id),
    (select count(*) from public.referral_conversions c
      where c.ambassador_id = p.id and c.status = 'counted'),
    (select count(*) from public.submissions s
      where s.ambassador_id = p.id and s.status in ('approved', 'auto_approved')),
    to_jsonb(p),
    p.status_reason,
    coalesce(p.status_changed_at, now()),
    p.status_changed_by,
    starts_at + interval '30 days'
  from public.profiles p
  where p.id = target
    and p.status = 'suspended'
  on conflict (ambassador_id) do nothing;
$function$;

revoke all on function public.archive_suspended_ambassador(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.track_suspension()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status = 'suspended' and old.status is distinct from 'suspended' then
    perform public.archive_suspended_ambassador(new.id);
  elsif old.status = 'suspended' and new.status is distinct from 'suspended' then
    delete from public.suspended_ambassadors where ambassador_id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_track_suspension on public.profiles;
create trigger profiles_track_suspension
  after update of status on public.profiles
  for each row execute function public.track_suspension();

-- ─── Backfill ───────────────────────────────────────────────────────────────
--
-- Everyone already suspended gets a full 30 days from today, not from the day
-- they were suspended — otherwise the first nightly run would delete people
-- nobody had been warned about.
select public.archive_suspended_ambassador(id, now())
from public.profiles
where status = 'suspended';
