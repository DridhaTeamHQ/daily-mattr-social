-- ─────────────────────────────────────────────────────────────────────────────
-- 0055 — Zones an admin sets by hand
--
-- An ambassador's zone is a call an admin makes, not a figure: red for the
-- ones to act on, orange for the ones to watch. It is stored, one row per
-- ambassador, and anybody without a row is green.
--
-- Its own table rather than a column on profiles: profiles is self-updatable
-- under RLS and every new column there has to be remembered in
-- guard_profile_privilege_columns (0026 is the time it was not). Here nobody
-- but an admin can read or write anything, so there is nothing to forget.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.ambassador_zones (
  ambassador_id uuid primary key references public.profiles(id) on delete cascade,
  zone          text not null,
  set_by        uuid references public.profiles(id) on delete set null,
  set_at        timestamptz not null default now(),

  constraint ambassador_zones_zone_known check (zone in ('red', 'orange'))
);

alter table public.ambassador_zones enable row level security;

revoke all on public.ambassador_zones from anon, authenticated;
grant select, insert, update, delete on public.ambassador_zones to authenticated;

drop policy if exists ambassador_zones_admin_all on public.ambassador_zones;
create policy ambassador_zones_admin_all on public.ambassador_zones
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
