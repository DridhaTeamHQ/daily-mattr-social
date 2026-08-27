import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

import { clientIp } from "@/lib/client-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTextSetting } from "@/lib/settings";
import type { Enums } from "@/lib/database.types";

/**
 * The referral link a student actually shares.
 *
 * This exists to give the funnel its first stage. "Referral link clicks to
 * installs" needs a numerator, and nothing we owned used to sit between a
 * student posting a link and the Play Store opening — the link WAS the store
 * link, so a click was invisible.
 *
 * Sending people through here buys two things: a click we can count and a store
 * we can attribute. It costs one redirect.
 *
 * Nothing here can fail loudly. A student's link must open the store even if
 * the code is nonsense, the database is down, or the settings row is missing —
 * a broken referral link costs a real download, and a lost analytics row costs
 * a row.
 *
 * Lives in a module rather than in the route because there are two routes now:
 * the short `/DMB18` that gets shared, and the original `/r/DMB18` that is
 * already out in the world. Two copies of a redirect that writes analytics is
 * how the short one quietly stops counting.
 */

const PLAY_FALLBACK =
  "https://play.google.com/store/apps/details?id=com.dailymattr";

/**
 * Where an iPhone goes while there is no iOS build.
 *
 * Not the App Store: that listing does not exist, so the link a student shared
 * would 404 in front of the person they shared it with. Not the Play Store
 * either — an install button that cannot install is a worse answer than being
 * told plainly.
 */
const IOS_NOTICE = "/android-only";

/**
 * The shape of a referral code, used to decide what is a code at all.
 *
 * Matters only for the short route: that one sits at the root, so it is offered
 * every path that no page claimed. Without this, `/favicon.ico` and every
 * mistyped URL would be recorded as a referral click and redirected to the Play
 * Store instead of showing the 404.
 *
 * Deliberately looser than `isStructuredCode`: legacy codes like `DM54JGJ3` are
 * still live on posters, and a code that has been reissued into a shape this
 * does not know should fail as "not found", never as "sent to the wrong place".
 */
export function looksLikeReferralCode(value: string): boolean {
  return /^DM[A-Z0-9]{2,30}$/.test(value);
}

/** Codes are matched upper-case, and the path is where the casing gets lost. */
export function normalizePathCode(raw: string | undefined): string {
  return (raw ?? "").trim().toUpperCase().slice(0, 32);
}

/**
 * Which store the device is asking for.
 *
 * Still recorded per device even though only one store can be reached: how many
 * people are tapping these links on an iPhone is the number that says what the
 * Android-only build is costing, and it disappears the moment every click is
 * filed as 'play_store'.
 *
 * User-agent sniffing is unreliable in general and entirely adequate here, and
 * 'unknown' is recorded honestly rather than guessed at.
 */
function storeFor(userAgent: string): Enums<"install_store"> {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "app_store";
  if (/android/.test(ua)) return "play_store";
  return "unknown";
}

/** Same one-way hash the survey route uses: enough to spot repeats, not an identity. */
function hashIp(ip: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/**
 * Record the click and say where to send them.
 *
 * Returns the destination rather than redirecting, because `redirect()` throws
 * to unwind and a helper that throws control flow is a trap for the next
 * caller. The routes do the redirecting.
 */
export async function resolveReferralClick(
  request: NextRequest,
  code: string,
): Promise<string> {
  const userAgent = request.headers.get("user-agent") ?? "";
  const store = storeFor(userAgent);
  const isIos = store === "app_store";

  // Desktop lands on the Play Store with everyone else: 'unknown' is usually
  // someone checking their own link, and the listing is the honest answer.
  let destination = isIos ? IOS_NOTICE : PLAY_FALLBACK;

  try {
    // The notice is a page of ours, not a setting — there is no store URL to
    // look up for a platform the app is not on.
    if (!isIos) {
      destination = await getTextSetting("play_store_url", destination);
    }

    const db = createAdminClient();

    const { data: owner } = await db
      .from("profiles")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();

    // An unrecognised code is still recorded, with a null owner. Someone
    // mistyping a code or a code from a deleted account is a real thing that
    // happened to a real link, and dropping it would quietly overstate the
    // click-through rate of every code that does resolve.
    await db.from("referral_clicks").insert({
      ambassador_id: owner?.id ?? null,
      code,
      store,
      ip_hash: hashIp(clientIp(request.headers) ?? ""),
      user_agent: userAgent.slice(0, 400),
    });
  } catch {
    // Swallowed on purpose. The redirect is the promise this route makes to
    // the student; analytics is the thing we would rather lose.
  }

  return destination;
}
