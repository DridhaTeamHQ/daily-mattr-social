-- Batches become letters, and every referral code is reissued to match.
--
-- A code is DM + the batch letter + a serial: DMA01 is the first ambassador in
-- batch A, DMB01 the first in batch B. The old scheme used the batch NUMBER,
-- and before that codes were random (DM54JGJ3) and said nothing at all — so an
-- admin reading a code off a support message had to look the person up.
--
-- '0' stands in for "no batch set". DM001 is honest about being unassigned
-- rather than quietly claiming batch A; assigning the batch and reissuing from
-- the ambassador page turns it into a real one.

-- ─── The letter a batch label contributes ───────────────────────────────────
-- Mirrors batchLetter() in src/lib/referral-code-shape.ts. Kept in SQL as well
-- because the backfill below has to agree with the application exactly, and a
-- second implementation that drifts is worse than none.
create or replace function public.batch_letter(batch text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  -- "batch" comes off first, or the rule below reads the B in "Batch A".
  value text := btrim(regexp_replace(coalesce(batch, ''), 'batch', ' ', 'gi'));
  found text;
  n int;
begin
  if value = '' then
    return '0';
  end if;

  found := substring(value from '[A-Za-z]');
  if found is not null then
    return upper(found);
  end if;

  found := substring(value from '\d+');
  if found is not null then
    n := found::int;
    if n between 1 and 26 then
      return chr(64 + n);
    end if;
  end if;

  return '0';
end;
$$;

revoke execute on function public.batch_letter(text) from public, anon, authenticated;

-- ─── Numbered batches become lettered ones ──────────────────────────────────
-- "Batch 2" is batch B, and stays one group rather than becoming a second.
-- Anything outside 1–26 is left exactly as typed: rewriting an admin's
-- "Batch 67" would be a guess presented as a correction.
update public.profiles
set batch = 'Batch ' || public.batch_letter(batch)
where batch is not null
  and public.batch_letter(batch) <> '0'
  and batch <> 'Batch ' || public.batch_letter(batch);

-- ─── Reissue every code ─────────────────────────────────────────────────────
-- Two passes. `profiles.referral_code` is unique, and Postgres checks that per
-- row as the statement runs, so writing the final values in one update can
-- collide with a code another row has not given up yet. Parking everything on
-- a temporary value first makes the order irrelevant.
with numbered as (
  select
    id,
    public.batch_letter(batch) as letter,
    row_number() over (
      partition by public.batch_letter(batch)
      order by created_at, id
    ) as serial
  from public.profiles
)
update public.profiles p
set referral_code = 'TMP-' || n.id
from numbered n
where p.id = n.id;

with numbered as (
  select
    id,
    public.batch_letter(batch) as letter,
    row_number() over (
      partition by public.batch_letter(batch)
      order by created_at, id
    ) as serial
  from public.profiles
)
update public.profiles p
set referral_code = 'DM' || n.letter || lpad(n.serial::text, 2, '0')
from numbered n
where p.id = n.id;

-- ─── New accounts ───────────────────────────────────────────────────────────
-- The trigger on auth.users still mints a random code, because at the moment a
-- row appears there nobody has said which batch the person is in. The admin
-- flows overwrite it with a structured one immediately; this comment exists so
-- the next person to find a DM7X2K9Q in the table knows it came in that way.
