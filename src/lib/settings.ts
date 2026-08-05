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
  stipend_min_downloads: 30,
  stipend_min_surveys: 3,
  stipend_amount_inr: 2000,
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
