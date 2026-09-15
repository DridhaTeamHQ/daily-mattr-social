-- ─────────────────────────────────────────────────────────────────────────────
-- 0044 — Back-date activation to the earliest proof, not just the first
--        surviving session
--
-- 0041 backfilled `activated_at` from the earliest row in `auth.sessions`. It
-- said out loud that sessions are pruned on sign-out and expiry and that the
-- earliest surviving one can therefore be later than the real acceptance —
-- and then shipped anyway. It is later, and by enough to change the numbers:
--
--   K. Harini Chowdhary  invited 21 Aug, recorded 31 Aug — she was uploading
--                        submissions on the 21st
--   Madiha Anjum         invited 18 Aug, recorded 24 Aug — uploading on the 18th
--   Tejesh Chulla        invited  7 Sep, recorded 13 Sep — uploading on the 7th
--
-- Nobody can upload before they accept, so those three dates were provably
-- wrong, and each one cost its ambassador a shorter month than they served:
-- Harini lost the five quiz campaigns that closed on 25 Aug and read as 11
-- tasks out of a possible 16.
--
-- A session is one kind of evidence and not the sturdiest. This takes the
-- earliest of everything that can only exist once somebody is actually in:
--
--   * their first submission upload  — an exact stamp, and the strongest of
--     the three: you cannot upload to a campaign you have not signed in to
--   * their earliest surviving session
--   * their first `active_days` row  — a date, not an instant, so it is read
--     as the start of that day in IST
--
-- Floored at `created_at` throughout. `active_days` is day-granular and its
-- IST midnight lands before the invite for anyone who accepted on the day they
-- were invited; without the floor that would date an acceptance before the
-- account it belongs to existed. With it, the worst case is the invite stamp,
-- which for a same-day acceptance is a few hours early and changes no month.
--
-- Only ever moves a date earlier. Somebody whose first evidence is later than
-- what is already recorded keeps what they have — this is correcting a floor
-- that was set too high, not re-deriving the column from scratch.
--
-- The trigger from 0041 is untouched and stays correct: from here on the stamp
-- is written at the moment of the status flip and needs no reconstructing.
-- ─────────────────────────────────────────────────────────────────────────────

update public.profiles p
set activated_at = greatest(p.created_at, evidence.first_seen)
from (
  select
    p2.id,
    least(
      coalesce(
        (select min(s.created_at) from auth.sessions s where s.user_id = p2.id),
        'infinity'::timestamptz
      ),
      coalesce(
        (
          select min(sb.uploaded_at)
          from public.submissions sb
          where sb.ambassador_id = p2.id
        ),
        'infinity'::timestamptz
      ),
      coalesce(
        (
          select min(a.day)::timestamp at time zone 'Asia/Kolkata'
          from public.active_days a
          where a.ambassador_id = p2.id
        ),
        'infinity'::timestamptz
      )
    ) as first_seen
  from public.profiles p2
  where p2.activated_at is not null
) as evidence
where evidence.id = p.id
  and evidence.first_seen < 'infinity'::timestamptz
  and greatest(p.created_at, evidence.first_seen) < p.activated_at;

comment on column public.profiles.activated_at is
  'When the student accepted their invite and set a password, as opposed to '
  'created_at, which is when an admin sent it. Null while the invite is '
  'unopened. Set once, on the first transition into active, and never moved '
  'again — a suspension and a reinstatement do not restart their membership. '
  'Rows predating the column were reconstructed from the earliest evidence '
  'the account was in use: a submission, a session, or an active day, '
  'whichever came first, and never earlier than created_at. Completion floors '
  'each ambassador''s task pool at coalesce(activated_at, created_at).';
