-- ─────────────────────────────────────────────────────────────────────────────
-- 0056 — Welcome emails go out when an admin says so
--
-- Importing a list used to email every row its login as it was created. For
-- a new batch that is the wrong order: the accounts should be in place and
-- checked first, and the emails sent when the batch is ready to start. So an
-- import now only creates accounts (status 'invited'), and the welcome email
-- is a separate "Send mail" action on the ambassadors page.
--
-- This table is how the page knows who has been mailed: one row per
-- ambassador, written each time a welcome email is attempted. No row means
-- nobody has sent one from the console yet.
--
-- No password is stored. Sending the email sets a fresh temporary password
-- and puts that in the message, so there is never a readable copy to keep.
--
-- Admin-only, like ambassador_zones (0055), and for the same reason: a
-- column on profiles would be self-writable unless the guard trigger is
-- taught about it.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.ambassador_welcome_emails (
  ambassador_id uuid primary key references public.profiles(id) on delete cascade,
  -- When the last attempt was made, and whether Brevo accepted it.
  last_attempt_at timestamptz not null default now(),
  last_status     text not null,
  -- When one was last accepted. Null if every attempt so far has failed.
  sent_at         timestamptz,
  sent_count      integer not null default 0,
  sent_by         uuid references public.profiles(id) on delete set null,

  constraint ambassador_welcome_emails_status_known
    check (last_status in ('sent', 'failed'))
);

alter table public.ambassador_welcome_emails enable row level security;

revoke all on public.ambassador_welcome_emails from anon, authenticated;
grant select on public.ambassador_welcome_emails to authenticated;

drop policy if exists ambassador_welcome_emails_admin_read on public.ambassador_welcome_emails;
create policy ambassador_welcome_emails_admin_read on public.ambassador_welcome_emails
  for select to authenticated
  using (public.is_admin());
