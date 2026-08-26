import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Typed reads of `app_settings`.
 *
 * Everything configurable lives in one table so thresholds can move without a
 * deploy — stipend rules, points per download, store URLs, the download goal.
 * The cost of that is that every value arrives as untyped JSON, and a bad row
 * would otherwise become a `NaN` somewhere far away from the row that caused
 * it. These readers take a fallback and never return anything but a usable
 * value of the right type.
 */

export const SETTING_FALLBACKS = {
  download_goal: 10_000,
  // The published programme terms. Every one of these is a row in
  // app_settings, so the numbers on the poster and the numbers the app pays
  // out cannot drift apart without somebody changing them on purpose.
  stipend_min_downloads: 30,
  stipend_min_surveys: 2,
  stipend_min_responses_per_survey: 10,
  stipend_min_completion_pct: 80,
  stipend_amount_inr: 3000,
  stipend_bonus_per_downloads: 50,
  stipend_bonus_inr: 500,
  activity_window_days: 10,
  activity_min_days: 8,
  points_per_rupee: 10,
  min_redemption_points: 500,
  streak_bonus_weeks: 3,
  streak_bonus_points: 100,
  referral_multiplier_threshold: 25,
  referral_multiplier: 1.2,
} as const;

export type NumericSetting = keyof typeof SETTING_FALLBACKS;

/** Reads several settings in one round trip. */
export async function getSettings<K extends NumericSetting>(
  ...keys: K[]
): Promise<Record<K, number>> {
  const out = {} as Record<K, number>;
  for (const key of keys) out[key] = SETTING_FALLBACKS[key];

  if (keys.length === 0) return out;

  const { data } = await createAdminClient()
    .from("app_settings")
    .select("key, value")
    .in("key", keys as string[]);

  for (const row of data ?? []) {
    const parsed = Number(row.value);
    // A malformed row keeps the fallback rather than poisoning the maths. A
    // stipend threshold of NaN would silently mark every ambassador ineligible.
    if (Number.isFinite(parsed)) out[row.key as K] = parsed;
  }

  return out;
}

export async function getSetting(key: NumericSetting): Promise<number> {
  return (await getSettings(key))[key];
}

/** Free-form string settings — store URLs and the like. */
export async function getTextSetting(
  key: string,
  fallback: string,
): Promise<string> {
  const { data } = await createAdminClient()
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const value = data?.value;
  return typeof value === "string" && value.trim() ? value : fallback;
}

/**
 * When a feature opens to students, if it is on a timer.
 *
 * The referral link and QR are built and working but held back until the app
 * is actually in the stores — a link that opens a dead listing costs a real
 * download and the student's confidence in the code they just handed over.
 *
 * A row rather than a deploy: the date these open is a business decision that
 * moves, and "unlock it on the 3rd" should not mean shipping code on the 3rd.
 * Set the row to a future timestamp and the card opens by itself; set it to a
 * past one to open it now.
 *
 *   insert into app_settings (key, value)
 *   values ('referral_link_unlock_at', to_jsonb('2026-09-01T00:00:00+05:30'::text))
 *   on conflict (key) do update set value = excluded.value;
 *
 * Absent or unparseable means locked, which is the safe direction: a typo in
 * the date must not open a feature early.
 */
export async function getUnlockAt(key: string): Promise<Date | null> {
  const raw = await getTextSetting(key, "");
  if (!raw.trim()) return null;

  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Has a timed feature opened yet? */
export function isUnlocked(unlockAt: Date | null): boolean {
  return unlockAt !== null && Date.now() >= unlockAt.getTime();
}

/** List settings, e.g. the city dropdown. */
export async function getListSetting(key: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  return Array.isArray(data?.value)
    ? data.value.filter((v): v is string => typeof v === "string")
    : [];
}
