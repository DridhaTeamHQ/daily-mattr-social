import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { normalizePathCode, resolveReferralClick } from "@/lib/referral-click";

/**
 * The original referral link, kept working.
 *
 * `/DMB18` is what gets shared now, but `/r/DMB18` is already in WhatsApp
 * threads, on printed cards and in bios. Retiring it would break links that
 * are out in the world, which is the one thing a referral programme cannot
 * afford to do to the students who did the sharing.
 *
 * No shape guard here, unlike the short route: this path is ours alone, so
 * nothing else can arrive at it by accident.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  redirect(await resolveReferralClick(request, normalizePathCode(raw)));
}
