-- ============================================================================
-- 0015 — Stipend eligibility, redemptions and payouts
-- ============================================================================
-- The money layer, which did not exist in any form.
--
-- Eligibility is deliberately a FUNCTION over the existing data rather than a
-- stored monthly snapshot. A stored table would need a job to write it, would
-- drift the moment an admin corrected a download count, and would answer "were
-- they eligible when we last ran the job" instead of "are they eligible". The
-- thresholds live in app_settings so finance can move them without a deploy.
--
-- Payouts, by contrast, ARE stored, because a payout is an event that happened
-- in the world and carries a bank reference. Eligibility is a calculation;
-- a payment is a fact.
-- ============================================================================

create type public.payout_status as enum ('pending', 'processing', 'paid', 'failed');

create type public.redemption_status as enum ('requested', 'approved', 'rejected', 'paid');

-- ─── Settings ───────────────────────────────────────────────────────────────

insert into public.app_settings (key, value, description)
values
  ('stipend_min_downloads', '30'::jsonb, 'Downloads needed in a month to earn the stipend.'),
  ('stipend_min_surveys',   '3'::jsonb,  'Valid survey responses needed in a month to earn the stipend.'),
  ('stipend_amount_inr',    '2000'::jsonb, 'Monthly stipend paid to an eligible ambassador, in rupees.'),
  ('points_per_rupee',      '10'::jsonb, 'Points burned per rupee when redeeming points for cash.'),
  ('min_redemption_points', '500'::jsonb, 'Smallest redemption an ambassador may request.')
on conflict (key) do nothing;

-- ─── Redemption requests ────────────────────────────────────────────────────

create table public.redemption_requests (
  id             uuid primary key default gen_random_uuid(),
  ambassador_id  uuid        not null references public.profiles (id) on delete cascade,
  points         integer     not null check (points > 0),
  amount_inr     numeric(10, 2) not null check (amount_inr >= 0),
  status         public.redemption_status not null default 'requested',
  method         text        not null default 'upi',
  payee_ref      text,
  note           text,
  decided_by     uuid        references public.profiles (id) on delete set null,
  decided_at     timestamptz,
  decision_note  text,
  requested_at   timestamptz not null default now()
);

create index redemption_requests_ambassador_idx
  on public.redemption_requests (ambassador_id, requested_at desc);

create index redemption_requests_open_idx
  on public.redemption_requests (status) where status in ('requested', 'approved');

-- ─── Payout batches ─────────────────────────────────────────────────────────

create table public.payout_batches (
  id           uuid primary key default gen_random_uuid(),
  label        text        not null,
  kind         text        not null default 'stipend' check (kind in ('stipend', 'redemption')),
  period_month date,
  status       public.payout_status not null default 'pending',
  created_by   uuid        references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);

create index payout_batches_created_idx on public.payout_batches (created_at desc);

create table public.payouts (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid        references public.payout_batches (id) on delete cascade,
  ambassador_id  uuid        not null references public.profiles (id) on delete cascade,
  redemption_id  uuid        references public.redemption_requests (id) on delete set null,
  kind           text        not null default 'stipend' check (kind in ('stipend', 'redemption')),
  amount_inr     numeric(10, 2) not null check (amount_inr >= 0),
  status         public.payout_status not null default 'pending',
  -- The bank's reference for the transfer. Section 8 calls for it explicitly:
  -- without it a "paid" row is an assertion rather than a receipt.
  utr            text,
  failure_reason text,
  processed_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index payouts_batch_idx on public.payouts (batch_id);
create index payouts_ambassador_idx on public.payouts (ambassador_id, created_at desc);

-- One stipend per person per month, enforced rather than trusted. Re-running a
-- batch build is a normal thing to do after a correction, and it must not be
-- able to pay someone twice.
create unique index payouts_one_stipend_per_month
  on public.payouts (ambassador_id, batch_id)
  where kind = 'stipend';

-- ─── Eligibility ────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER for the same reason `leaderboard` is: it reads across every
-- ambassador's conversions and responses, which no student may do directly.
-- The admin check is inside, so a student calling it gets nothing.

create or replace function public.stipend_eligibility(period_start date)
returns table (
  ambassador_id uuid,
  full_name     text,
  city          text,
  batch         text,
  downloads     bigint,
  surveys       bigint,
  met           boolean,
  at_risk       boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  min_downloads integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_min_downloads'), 30);
  min_surveys   integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_min_surveys'), 3);
  period_end    date := (period_start + interval '1 month')::date;
  -- "At risk" only means anything while the month is still running. On a past
  -- month every shortfall is simply a miss, and flagging it as a risk would be
  -- telling an admin to chase someone about a month that has already closed.
  is_current    boolean := date_trunc('month', now())::date = period_start;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  with dl as (
    select rc.ambassador_id as aid, count(*) as n
    from public.referral_conversions rc
    where rc.status = 'counted'
      and rc.converted_at >= period_start
      and rc.converted_at < period_end
    group by rc.ambassador_id
  ),
  sv as (
    select sr.ambassador_id as aid, count(*) as n
    from public.survey_responses sr
    where sr.status = 'valid'
      and sr.submitted_at >= period_start
      and sr.submitted_at < period_end
    group by sr.ambassador_id
  )
  select
    p.id,
    p.full_name,
    p.city,
    p.batch,
    coalesce(dl.n, 0),
    coalesce(sv.n, 0),
    coalesce(dl.n, 0) >= min_downloads and coalesce(sv.n, 0) >= min_surveys,
    is_current
      and not (coalesce(dl.n, 0) >= min_downloads and coalesce(sv.n, 0) >= min_surveys)
      and (coalesce(dl.n, 0) > 0 or coalesce(sv.n, 0) > 0)
  from public.profiles p
  left join dl on dl.aid = p.id
  left join sv on sv.aid = p.id
  where p.role = 'ambassador'
    and p.status = 'active'
  order by coalesce(dl.n, 0) desc, p.full_name asc;
end;
$$;

revoke execute on function public.stipend_eligibility(date) from public, anon, authenticated;
grant execute on function public.stipend_eligibility(date) to authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.redemption_requests enable row level security;
alter table public.payout_batches      enable row level security;
alter table public.payouts             enable row level security;

-- A student may see their own requests and their own payouts, and may raise a
-- request. They may never change one after the fact — approving your own
-- redemption would otherwise be a single UPDATE away.
create policy redemption_select_own on public.redemption_requests
  for select to authenticated
  using (ambassador_id = auth.uid());

create policy redemption_insert_own on public.redemption_requests
  for insert to authenticated
  with check (ambassador_id = auth.uid() and status = 'requested');

create policy redemption_all_admin on public.redemption_requests
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy payouts_select_own on public.payouts
  for select to authenticated
  using (ambassador_id = auth.uid());

create policy payouts_all_admin on public.payouts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy payout_batches_all_admin on public.payout_batches
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
