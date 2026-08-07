-- Three ways a signed-in user could give themselves something they had not
-- earned. All three were reachable by talking to PostgREST directly, without
-- going through the app at all — which is the part that matters: every guard
-- below had an app-side equivalent already, and every one of them was
-- bypassable by skipping the app.

-- ─── 1. Signup could hand out the admin role ────────────────────────────────
--
-- handle_new_user() built the profile with
--   role := coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'ambassador')
-- and raw_user_meta_data is supplied by whoever calls signup. If the project's
-- signup endpoint is open, `{"data":{"role":"admin"}}` self-provisions an
-- ACTIVE admin — the whole console, unauthenticated.
--
-- The app never relied on this: the one place that creates accounts
-- (inviteAmbassador, src/lib/admin/actions.ts:480) already passes
-- role: "ambassador" literally. So the metadata key is pure attack surface and
-- is now ignored. Promoting somebody to admin is a deliberate UPDATE by an
-- admin or by service-role, which is what it should have been.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, full_name, phone, college, role, status, referral_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'college', ''),
    -- Never from metadata. See above.
    'ambassador'::user_role,
    case
      when new.encrypted_password is null or new.encrypted_password = ''
        then 'invited'::user_status
      else 'active'::user_status
    end,
    public.gen_referral_code()
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

-- ─── 2. Ambassadors set the rupee value of their own payout ─────────────────
--
-- The RLS insert policy pins ambassador_id and status:
--   with check (ambassador_id = auth.uid() and status = 'requested')
-- and says nothing about points or amount_inr. The conversion lived only in
-- the server action, so a direct POST to /rest/v1/redemption_requests could
-- claim any rupee figure it liked. Approval re-checked the POINTS balance —
-- which passes, the points are real — and never recomputed the money, and the
-- payout batch copies amount_inr verbatim into the bank export.
--
-- 500 legitimate points (₹50) could therefore be requested as ₹500,000.
--
-- The amount is now derived in the database from points and the configured
-- rate, for anyone who is not an admin. Admins keep the ability to set it
-- directly, because correcting a payout by hand is a real thing they do.
create or replace function public.pin_redemption_amount()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  rate integer;
begin
  -- service-role (auth.uid() is null) and admins are trusted to set it.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  select coalesce(value::text::integer, 10) into rate
  from public.app_settings
  where key = 'points_per_rupee';

  new.amount_inr := floor(new.points::numeric / greatest(coalesce(rate, 10), 1));
  return new;
end;
$$;

drop trigger if exists redemption_pin_amount on public.redemption_requests;
create trigger redemption_pin_amount
  before insert or update on public.redemption_requests
  for each row execute function public.pin_redemption_amount();

-- ─── 3. Survey responses minted points without limit ────────────────────────
--
-- Deduplication rested entirely on two partial unique indexes keyed on the
-- respondent's email and phone:
--   ... where status = 'valid' and respondent_email is not null
-- Both fields are optional per survey (surveys.require_email /
-- require_phone). On a survey with both switched off, every submission is a
-- fresh valid row, and every valid row credits the ambassador. One public URL,
-- no account, a loop — unlimited points, which become stipend and then cash.
--
-- ip_hash was already computed, stored AND indexed
-- (survey_responses_ip_idx) — it was simply never read. The app now enforces a
-- per-(survey, ip_hash) window, and this index is what makes that lookup cheap.
-- Kept here as an explicit statement of intent rather than left implicit.
create index if not exists survey_responses_ip_window_idx
  on public.survey_responses (survey_id, ip_hash, submitted_at desc)
  where ip_hash is not null;

comment on index public.survey_responses_ip_window_idx is
  'Backs the per-IP dedupe window in the public survey submit path. Without it that check is a scan on every submission.';
