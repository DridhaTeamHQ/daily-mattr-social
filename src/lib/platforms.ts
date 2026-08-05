/**
 * The social networks a campaign can target.
 *
 * A plain module, not a `"use server"` one: every export there must be an
 * async function, and a constant array in an action file breaks the whole
 * module at build time. Kept here so both the server actions and the client
 * dropdowns can read the same list.
 *
 * Free text in the database behind it, so adding a network is a line here
 * rather than a migration.
 */
export const SOCIAL_PLATFORMS = [
  "Instagram",
  "Snapchat",
  "Facebook",
  "X",
  "Reddit",
  "YouTube",
  "LinkedIn",
  "WhatsApp",
  "Threads",
  "Telegram",
  "Other",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Brand-ish tint per network, so a list of mixed campaigns is scannable. */
export const PLATFORM_TONE: Record<string, string> = {
  Instagram: "bg-reel-tint text-reel",
  Snapchat: "bg-amber-50 text-amber-700",
  Facebook: "bg-brand-tint text-brand-strong",
  X: "bg-gray-100 text-ink",
  Reddit: "bg-orange-50 text-orange-700",
  YouTube: "bg-rose-50 text-rose-700",
  LinkedIn: "bg-sky-50 text-sky-700",
  WhatsApp: "bg-emerald-50 text-emerald-700",
  Threads: "bg-gray-100 text-ink",
  Telegram: "bg-sky-50 text-sky-700",
  Other: "bg-gray-100 text-ink-soft",
};
