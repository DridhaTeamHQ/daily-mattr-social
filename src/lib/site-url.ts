import "server-only";

import { headers } from "next/headers";

/**
 * The origin to build shareable links from.
 *
 * Survey links are the one thing in this app that leaves the app — a student
 * pastes them into WhatsApp and a stranger opens them. Getting this wrong
 * doesn't degrade the feature, it breaks it silently: the link looks fine to
 * the student and 404s for everyone else.
 *
 * Resolution order, most trustworthy first:
 *
 *  1. `NEXT_PUBLIC_SITE_URL`, when it points somewhere real. This is the
 *     canonical domain and should win, so links stay stable even when opened
 *     from a Vercel preview deployment.
 *  2. The incoming request's own host. Correct on production, previews, custom
 *     domains and localhost, with nothing to configure — which is what makes
 *     forgetting step 1 harmless instead of fatal.
 *  3. localhost, for the rare non-request context.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");

  // A configured localhost value is almost always a .env.example left in place
  // on a deployed environment, so it is deliberately not trusted over the
  // request's real host.
  if (configured && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(configured)) {
    return configured;
  }

  try {
    const headerList = await headers();

    // Vercel and most proxies set x-forwarded-host; `host` is the direct one.
    const host =
      headerList.get("x-forwarded-host") ?? headerList.get("host") ?? null;

    if (host) {
      const proto =
        headerList.get("x-forwarded-proto") ??
        (host.startsWith("localhost") || host.startsWith("127.0.0.1")
          ? "http"
          : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() throws outside a request scope.
  }

  return configured || "http://localhost:3000";
}
