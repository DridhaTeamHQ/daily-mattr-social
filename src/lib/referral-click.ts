import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

import { clientIp } from "@/lib/client-ip";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * we can attribute. It costs one page load.
 *
 * Nothing here can fail loudly. A student's link must open the store even if
 * the code is nonsense, the database is down, or the settings row is missing —
 * a broken referral link costs a real download, and a lost analytics row costs
 * a row.
 *
 * Lives in a module rather than in the route because there are two routes now:
 * the short `/DMB18` that gets shared, and the original `/r/DMB18` that is
 * already out in the world. Two copies of a route that writes analytics is
 * how the short one quietly stops counting.
 */

/**
 * The shape of a referral code, used to decide what is a code at all.
 *
 * Matters only for the short route: that one sits at the root, so it is offered
 * every path that no page claimed. Without this, `/favicon.ico` and every
 * mistyped URL would be recorded as a referral click and sent to a store
 * instead of showing the 404.
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
 * Recorded with the click so the growth page can split clicks by store.
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

/** The crawlers chat and social apps send to build a link preview. */
function isLinkPreviewBot(userAgent: string): boolean {
  return /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|Discordbot|LinkedInBot|Snap URL Preview|Pinterestbot|SkypeUriPreview|Iframely|redditbot/i.test(
    userAgent,
  );
}

/** Same one-way hash the survey route uses: enough to spot repeats, not an identity. */
function hashIp(ip: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/**
 * Record the click.
 *
 * Only records: where the phone goes is decided by `download-page` in the
 * browser, which can tell an iPad from a Mac where this header cannot. The
 * `store` written here is the server's best guess, for the growth page's split.
 */
export async function recordReferralClick(
  request: NextRequest,
  code: string,
): Promise<void> {
  const userAgent = request.headers.get("user-agent") ?? "";

  // A chat app fetching the link to draw its preview card is not a person
  // tapping it — and WhatsApp does that from the sender's phone on every
  // share, which would count each share as a click.
  if (isLinkPreviewBot(userAgent)) return;

  try {
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
      store: storeFor(userAgent),
      ip_hash: hashIp(clientIp(request.headers) ?? ""),
      user_agent: userAgent.slice(0, 400),
    });
  } catch {
    // Swallowed on purpose. Opening the store is the promise the link makes
    // to the student; analytics is the thing we would rather lose.
  }
}
