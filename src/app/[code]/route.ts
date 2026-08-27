import { notFound, redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  looksLikeReferralCode,
  normalizePathCode,
  resolveReferralClick,
} from "@/lib/referral-click";

/**
 * The short referral link: `dailymattr.app/DMB18`.
 *
 * A referral link gets read off a phone screen, typed into a browser by someone
 * who could not tap it, and said out loud across a table. `/r/` in the middle
 * of that is one more thing to get wrong for no benefit to the person reading
 * it — the code alone is the whole address.
 *
 * ─── Why this route needs a guard when `/r/[code]` does not ─────────────────
 *
 * This sits at the root, so Next offers it every path that no page or file
 * claimed. Static segments still win — `/login`, `/admin`, `/android-only` are
 * matched before this — but `/favicon.ico`, a stale bookmark and every typo
 * would land here. Without the shape check each of those would be written to
 * `referral_clicks` as a real click and redirected to the Play Store, which
 * both corrupts the funnel numbers and replaces the 404 page with a store.
 *
 * So anything that is not code-shaped is handed back to `not-found`, exactly as
 * if this route did not exist.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = normalizePathCode(raw);

  if (!looksLikeReferralCode(code)) notFound();

  redirect(await resolveReferralClick(request, code));
}
