-- Segmentation: where a student is, which batch they joined with, whether they
-- are a student or a working professional, and which phase of the programme a
-- point belongs to.
--
-- Every batch-and-geography number in the admin analytics was blocked on these
-- columns simply not existing. `profiles` carried `college` and nothing else,
-- so "downloads by city" and "batch vs batch" had no data to group by.
--
-- city and batch are plain text rather than enums on purpose. The programme
-- starts in Hyderabad, Vijayawada and Warangal, but the spec calls the
-- college-level breakdown "useful for future CAP planning" — that list grows,
-- and growing an enum costs a migration while growing a text column costs
-- nothing.

create type public.program_phase as enum ('phase_1', 'phase_2');

create type public.joined_as as enum ('student', 'professional');

alter table public.profiles
  add column if not exists city text,
  add column if not exists batch text,
  add column if not exists joined_as public.joined_as not null default 'student';

-- Partial indexes: most analytics filter to rows that actually carry a value,
-- and the nulls are dead weight in the index until every profile is backfilled.
create index if not exists profiles_city_idx
  on public.profiles (city) where city is not null;

create index if not exists profiles_batch_idx
  on public.profiles (batch) where batch is not null;

-- Phase 1 is the organic-interest half of the programme — surveys, follows,
-- Instagram engagement. Phase 2 is actual app installs. Both campaigns and
-- surveys therefore default to phase 1; only referrals are inherently phase 2.
alter table public.campaigns
  add column if not exists phase public.program_phase not null default 'phase_1';

alter table public.surveys
  add column if not exists phase public.program_phase not null default 'phase_1';

alter table public.point_ledger
  add column if not exists phase public.program_phase;

-- Backfill.
--
-- point_ledger carries a trigger that forbids UPDATE outright, which is
-- precisely what we want in normal operation and precisely what has to be
-- stood down for one statement here. A migration is the only place that is
-- legitimate, and the trigger goes straight back on below.
alter table public.point_ledger disable trigger point_ledger_no_update;

update public.point_ledger
set phase = case
  when reason = 'referral' then 'phase_2'::public.program_phase
  else 'phase_1'::public.program_phase
end
where phase is null;

alter table public.point_ledger enable trigger point_ledger_no_update;

create index if not exists point_ledger_phase_idx on public.point_ledger (phase);

-- Reference lists for the admin dropdowns. Seeded with the three launch cities
-- so the UI has something to offer on day one, but the column stays free text,
-- so an unlisted city is a typo risk rather than a blocker.
insert into public.app_settings (key, value, description)
values
  (
    'cities',
    '["Hyderabad", "Vijayawada", "Warangal"]'::jsonb,
    'Cities offered in the ambassador form. Free text is still accepted.'
  ),
  (
    'download_goal',
    '10000'::jsonb,
    'The programme-wide install target the admin dashboard tracks against.'
  )
on conflict (key) do nothing;
