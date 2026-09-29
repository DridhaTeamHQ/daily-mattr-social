import { downloadResponse } from "@/lib/download-page";

/**
 * The one download link, the same for everybody: `dailymattr.app/download`.
 *
 * Ambassadors share `/<code>` instead, which answers the same way and counts
 * the click on the way. This one is for anywhere that is not one ambassador's
 * — the website, a bio, a poster with no code on it. See `download-page`.
 */

// Read per request, so a corrected store setting is not baked into a build.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return downloadResponse(request);
}
