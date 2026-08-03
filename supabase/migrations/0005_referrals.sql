-- ============================================================================
-- 0005 — Referral codes and conversions
-- ============================================================================
-- The code itself lives on `profiles.referral_code`. This file records the
-- other half: which downloads we've confirmed against a code.
--
-- Conversions arrive as a CSV export from the DailyMattr side and are imported
-- by an admin. `source` reserves an 'api' value so a webhook can be added later
-- without a migration.
-- ============================================================================

create type conversion_source as enum ('csv_import', 'manual', 'api');
create type conversion_status as enum ('counted', 'void');

-- ─── Imports ────────────────────────────────────────────────────────────────

create table public.referral_imports (
  id             uuid primary key default gen_random_uuid(),
  filename       text        not null,
  row_count      integer     not null default 0,
  matched_count  integer     not null default 0,
  skipped_count  integer     not null default 0,  -- already imported (idempotent re-run)
  unmatched      jsonb       not null default '[]'::jsonb,  -- codes with no ambassador
  imported_by    uuid        references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index referral_imports_created_idx on public.referral_imports (created_at desc);

-- ─── Conversions ────────────────────────────────────────────────────────────

create table public.referral_conversions (
  id                uuid primary key default gen_random_uuid(),
  ambassador_id     uuid              not null references public.profiles (id) on delete cascade,

  -- The code exactly as it appeared in the source data. Kept alongside the FK
  -- so an import stays auditable even if a profile is later removed.
  code              text              not null,

  -- Whatever the DailyMattr app uses to identify the new user. This is what
  -- makes re-importing the same CSV safe.
  external_user_ref text              not null,

  source            conversion_source not null default 'csv_import',
  status            conversion_status not null default 'counted',
  converted_at      timestamptz       not null default now(),
  import_id         uuid              references public.referral_imports (id) on delete set null,
  notes             text,
  created_at        timestamptz       not null default now(),

  constraint referral_conversions_idempotent unique (code, external_user_ref)
);

create index referral_conversions_ambassador_idx
  on public.referral_conversions (ambassador_id, converted_at desc);

comment on constraint referral_conversions_idempotent on public.referral_conversions is
  'Re-importing the same CSV is a no-op rather than a double payout.';

-- ─── Ambassador-safe aggregate ──────────────────────────────────────────────

-- Students see their own conversion count. They do not see external_user_ref —
-- that identifies another person's app account.
create or replace function public.my_referral_stats()
returns table (
  code            text,
  total_confirmed bigint,
  points_earned   integer,
  last_conversion timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.referral_code,
    count(c.id) filter (where c.status = 'counted'),
    coalesce((
      select sum(pl.delta)::integer
      from public.point_ledger pl
      where pl.ambassador_id = auth.uid()
        and pl.reason = 'referral'
    ), 0),
    max(c.converted_at) filter (where c.status = 'counted')
  from public.profiles p
  left join public.referral_conversions c on c.ambassador_id = p.id
  where p.id = auth.uid()
  group by p.referral_code;
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.referral_conversions enable row level security;
alter table public.referral_imports     enable row level security;

-- No student select policy: external_user_ref points at a real person's app
-- account. Counts come from my_referral_stats() instead.
create policy referral_conversions_all_admin on public.referral_conversions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy referral_imports_all_admin on public.referral_imports
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
