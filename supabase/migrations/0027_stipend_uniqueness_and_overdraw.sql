-- ─── 1. "One stipend per person per month" was not enforced ─────────────────
--
-- The index says what it means to do and then does something else:
--
--   create unique index payouts_one_stipend_per_month
--     on public.payouts (ambassador_id, batch_id) where kind = 'stipend';
--
-- (ambassador_id, batch_id) is unique per BATCH, not per month. Two batches
-- for the same month — which is exactly what re-running a build after
-- correcting a download count produces — each accept the same ambassador, and
-- the guard the comment promises never fires. ₹3,000 twice.
--
-- The month lives on payout_batches, so a unique index on payouts cannot see
-- it. Denormalising it onto the payout is what makes the constraint
-- expressible, and a trigger keeps it honest rather than trusting callers.
alter table public.payouts
  add column if not exists period_month date;

update public.payouts p
   set period_month = b.period_month
  from public.payout_batches b
 where b.id = p.batch_id
   and p.period_month is distinct from b.period_month;

create or replace function public.set_payout_period_month()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  select period_month into new.period_month
  from public.payout_batches where id = new.batch_id;
  return new;
end;
$$;

drop trigger if exists payouts_set_period_month on public.payouts;
create trigger payouts_set_period_month
  before insert or update of batch_id on public.payouts
  for each row execute function public.set_payout_period_month();

drop index if exists public.payouts_one_stipend_per_month;

create unique index payouts_one_stipend_per_month
  on public.payouts (ambassador_id, period_month)
  where kind = 'stipend' and period_month is not null;

comment on index public.payouts_one_stipend_per_month is
  'One stipend per ambassador per month, across every batch. The previous version keyed on batch_id and so only deduped within a single batch.';

-- ─── 2. A balance could be spent twice by spending it at the same moment ────
--
-- decideRedemption reads the ledger, sums it, compares against the request,
-- and then inserts the burn as a separate statement. Two approvals running
-- concurrently both read the same pre-burn balance, both pass, and both
-- insert — the ambassador is paid for more points than they hold and the
-- ledger goes negative. The unique index on (source_type, source_id,
-- direction) stops the SAME request being burned twice; it says nothing about
-- two different requests racing.
--
-- Scoped deliberately to SPENDING, not to every negative row.
--
-- "A balance may never go negative" is the tempting rule and it is the wrong
-- one. A revoke is a negative row that is supposed to be able to overshoot:
-- earn 100, redeem 100, and then an admin revokes the original award — the
-- balance genuinely belongs at −100 and the ledger has to be able to say so.
-- Blocking that would protect the ambassador from a correction, which is the
-- opposite of the point. So the guard applies only where the balance is being
-- SPENT (source_type 'redemption_request'), which is the only place a
-- read-then-write race turns into a payment.
--
-- The advisory lock serialises concurrent burns for one ambassador, so the
-- balance each statement reads already accounts for any burn still in flight —
-- the part a plain read-then-write cannot get right. Different ambassadors
-- never contend, and every other write takes no lock at all.
create or replace function public.point_ledger_no_overdraw()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  current_balance integer;
begin
  if new.delta >= 0 or new.source_type is distinct from 'redemption_request' then
    return new;
  end if;

  -- Held to the end of the transaction, keyed on the ambassador, so two
  -- debits for the same person cannot interleave between the read and the
  -- insert. Different ambassadors never contend.
  perform pg_advisory_xact_lock(hashtextextended(new.ambassador_id::text, 0));

  select coalesce(sum(delta), 0) into current_balance
  from public.point_ledger
  where ambassador_id = new.ambassador_id;

  if current_balance + new.delta < 0 then
    raise exception
      'cannot redeem % points against a balance of %',
      abs(new.delta), current_balance
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists point_ledger_no_overdraw on public.point_ledger;
create trigger point_ledger_no_overdraw
  before insert on public.point_ledger
  for each row execute function public.point_ledger_no_overdraw();
