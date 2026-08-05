import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { notify } from "@/lib/notifications";

/**
 * The two multipliers, and the badges.
 *
 * Both of the enhancements from 9.4 come down to the same discipline: they may
 * only ever ADD points, and they must be safe to run twice. Every award below
 * writes through the ledger's `(source_type, source_id, direction)` unique
 * index, so a second run inserts nothing rather than paying twice — which
 * matters because these run on ordinary events (an approval, a download) that
 * can fire again after a correction.
 */

// ─── Referral tier multiplier ───────────────────────────────────────────────

/**
 * The bonus owed on top of flat referral points, once someone passes the
 * threshold.
 *
 * Expressed as a top-up rather than by paying a different rate per download,
 * so the base award stays one simple rule and the bonus is separately visible
 * in the ledger. A student who can see "Referral bonus +20" understands why
 * their total moved; a silently different rate looks like a mistake.
 */
export async function awardReferralBonus(
  ambassadorId: string,
  actorId: string | null,
): Promise<number> {
  const db = createAdminClient();

  const [settings, { count }] = await Promise.all([
    getSettings(
      "referral_multiplier_threshold",
      "referral_multiplier",
      "points_per_rupee",
    ),
    db
      .from("referral_conversions")
      .select("id", { count: "exact", head: true })
      .eq("ambassador_id", ambassadorId)
      .eq("status", "counted"),
  ]);

  const downloads = count ?? 0;
  const threshold = settings.referral_multiplier_threshold;
  const multiplier = settings.referral_multiplier;

  if (multiplier <= 1 || downloads < threshold) return 0;

  const { data: setting } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "points.referral")
    .maybeSingle();

  const perReferral = Number(setting?.value);
  if (!Number.isFinite(perReferral) || perReferral <= 0) return 0;

  // Only downloads PAST the threshold earn the uplift. Applying it to all of
  // them would hand out a lump sum the moment somebody crossed the line, for
  // work they were already paid flat rate for.
  const eligible = downloads - threshold;
  const owed = Math.round(eligible * perReferral * (multiplier - 1));
  if (owed <= 0) return 0;

  const { data: paid } = await db
    .from("point_ledger")
    .select("delta")
    .eq("ambassador_id", ambassadorId)
    .eq("source_type", "referral_multiplier");

  const already = (paid ?? []).reduce((sum, row) => sum + row.delta, 0);
  const delta = owed - already;
  if (delta <= 0) return 0;

  const { error } = await db.from("point_ledger").insert({
    ambassador_id: ambassadorId,
    delta,
    reason: "referral",
    source_type: "referral_multiplier",
    // Keyed by the download count it was earned at, so each new threshold
    // crossing is its own row and re-running at the same count is a no-op.
    source_id: `${ambassadorId}:${downloads}`,
    note: `Referral bonus — ${multiplier}× past ${threshold} downloads`,
    created_by: actorId,
    phase: "phase_2",
  });
  if (error) return 0;

  await notify({
    profileId: ambassadorId,
    type: "points_awarded",
    title: `Referral bonus — ${delta} points`,
    body: `You're past ${threshold} downloads, so every one after that is worth ${multiplier}×.`,
    href: "/dashboard/referrals",
  }).catch(() => {});

  return delta;
}

// ─── Streak bonus ───────────────────────────────────────────────────────────

/** Monday of the ISO week a date falls in, as YYYY-MM-DD. */
function weekKey(date: Date): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

/**
 * Pays the consistency bonus once a run of active weeks is reached.
 *
 * Weeks, not days. The spec's own argument is that consistency predicts a good
 * long-term ambassador better than one big burst, and a daily streak punishes
 * somebody who had exams on Tuesday — which measures availability rather than
 * commitment.
 */
export async function awardStreakBonus(
  ambassadorId: string,
  actorId: string | null,
): Promise<number> {
  const db = createAdminClient();

  const settings = await getSettings("streak_bonus_weeks", "streak_bonus_points");
  const needed = settings.streak_bonus_weeks;
  const points = settings.streak_bonus_points;

  if (needed <= 0 || points <= 0) return 0;

  const { data: earned } = await db
    .from("point_ledger")
    .select("created_at")
    .eq("ambassador_id", ambassadorId)
    .gt("delta", 0)
    .order("created_at", { ascending: false })
    .limit(500);

  const weeks = new Set((earned ?? []).map((row) => weekKey(new Date(row.created_at))));

  // Count back from this week. A gap ends the run — that is what a streak is.
  let run = 0;
  const cursor = new Date();
  for (let i = 0; i < 52; i++) {
    if (!weeks.has(weekKey(cursor))) break;
    run += 1;
    cursor.setDate(cursor.getDate() - 7);
  }

  if (run < needed) return 0;

  // Keyed by the run length, so a longer run later pays again but the same run
  // never pays twice.
  const sourceId = `${ambassadorId}:${run}`;

  const { data: existing } = await db
    .from("point_ledger")
    .select("id")
    .eq("source_type", "streak_bonus")
    .eq("source_id", sourceId)
    .maybeSingle();

  if (existing) return 0;

  const { error } = await db.from("point_ledger").insert({
    ambassador_id: ambassadorId,
    delta: points,
    reason: "manual_adjust",
    source_type: "streak_bonus",
    source_id: sourceId,
    note: `${run} weeks active in a row`,
    created_by: actorId,
    phase: "phase_1",
  });
  if (error) return 0;

  await notify({
    profileId: ambassadorId,
    type: "points_awarded",
    title: `${run} weeks in a row — ${points} points`,
    body: "Consistency bonus. Keep it going.",
    href: "/dashboard/rewards",
  }).catch(() => {});

  return points;
}
