import "server-only";

import { getTextSetting } from "@/lib/settings";

/**
 * Where the app lives, per store.
 *
 * Read from `app_settings` (`play_store_url`, `app_store_url`) so a listing can
 * be corrected without a deploy, with these as the fallback until a row
 * exists. One module so the referrals page and the `/<code>` redirect can
 * never disagree about where the app is.
 */
export const PLAY_STORE_FALLBACK =
  "https://play.google.com/store/apps/details?id=com.dailymattr";

export const APP_STORE_FALLBACK =
  "https://apps.apple.com/in/app/dailymattr/id6791996138";

export function getPlayStoreUrl(): Promise<string> {
  return getTextSetting("play_store_url", PLAY_STORE_FALLBACK);
}

export function getAppStoreUrl(): Promise<string> {
  return getTextSetting("app_store_url", APP_STORE_FALLBACK);
}
