-- ─────────────────────────────────────────────────────────────────────────────
-- 0058 — Codes left behind by deleted ambassadors
--
-- 0057 offers a suspended ambassador's code to the next person added. Once an
-- ambassador is deleted — by hand from the console, or by the 30-day purge —
-- their profile is gone, and with it the only record that their code was ever
-- issued. The code is still on posters and in bios, so it is worth handing on.
--
-- This table remembers it. The app writes a row whenever it deletes somebody
-- who still held their own code, and clears `reassigned_to` back to null if
-- the code is released again later. A code is offered while `reassigned_to`
-- is null and no profile currently holds it.
--
-- Deliberately no foreign key to the deleted person — there is nobody left to
-- point at. `from_name` is kept so the admin can tell which slot it was.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.released_referral_codes (
  code           text        primary key,
  from_name      text        not null,
  batch          text,
  -- 'deleted' (from the console) or 'purged' (30 days suspended).
  reason         text        not null,
  released_at    timestamptz not null default now(),
  reassigned_to  uuid        references public.profiles (id) on delete set null,
  reassigned_at  timestamptz,

  constraint released_referral_codes_reason_known
    check (reason in ('deleted', 'purged'))
);

alter table public.released_referral_codes enable row level security;

revoke all on public.released_referral_codes from anon, authenticated;
grant select on public.released_referral_codes to authenticated;

drop policy if exists released_referral_codes_admin_read on public.released_referral_codes;
create policy released_referral_codes_admin_read on public.released_referral_codes
  for select to authenticated
  using (public.is_admin());

-- Anyone the console has already deleted or purged left an audit row with
-- their name and code. Bring back the ones nobody holds now.
insert into public.released_referral_codes (code, from_name, batch, reason, released_at)
select distinct on (a.meta ->> 'referral_code')
  a.meta ->> 'referral_code',
  coalesce(nullif(a.meta ->> 'full_name', ''), a.meta ->> 'referral_code'),
  null,
  case when a.action = 'ambassador.purge' then 'purged' else 'deleted' end,
  a.created_at
from public.audit_log a
where a.action in ('ambassador.delete', 'ambassador.purge')
  and a.meta ->> 'referral_code' is not null
  and not exists (
    select 1 from public.profiles p where p.referral_code = a.meta ->> 'referral_code'
  )
order by a.meta ->> 'referral_code', a.created_at desc
on conflict (code) do nothing;
