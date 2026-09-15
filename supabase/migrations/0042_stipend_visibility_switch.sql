-- ─────────────────────────────────────────────────────────────────────────────
-- 0042 — A switch for whether students can see this month's stipend
--
-- The stipend figure is computed live, so it is right the moment a submission
-- is approved. That is the problem: a student watching it move mid-month reads
-- every change as a promise, and the team has not finished deciding the month
-- until it has. `stipend_unlock_at` shuts /dashboard/rewards until they have —
-- the same row-not-a-deploy mechanism `referral_link_unlock_at` uses, and the
-- same three states: null for locked, a past instant for open, a future one to
-- open by itself.
--
-- Seeded to the epoch, which reads as open. Absent means locked (see
-- `getUnlockAt` — the safe direction for a feature that has never shipped),
-- and letting this one arrive absent would hide the rewards page from every
-- student the moment it deploys, which nobody asked for. Locking it is a
-- decision an admin makes on /admin/stipend, not something a migration does
-- to them.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.app_settings (key, value, description)
values (
  'stipend_unlock_at',
  to_jsonb('1970-01-01T00:00:00.000Z'::text),
  'When students can see this month''s stipend on /dashboard/rewards. Empty '
  'or absent means locked. Set from the Stipend visibility card on '
  '/admin/stipend.'
)
on conflict (key) do nothing;
