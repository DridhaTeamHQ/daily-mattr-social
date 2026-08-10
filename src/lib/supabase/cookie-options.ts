import "server-only";

import type { CookieOptions } from "@supabase/ssr";

/**
 * The flags every auth cookie is written with.
 *
 * Supabase's SSR helper hands back whatever options it was configured with,
 * and unconfigured that meant the session and refresh tokens were set with
 * neither `Secure` nor `HttpOnly`. The refresh token in particular is a
 * long-lived credential: readable by any script that runs on the page, and
 * sendable over plain http on the first request after a user types the domain
 * without a scheme.
 *
 * `httpOnly` is only safe because nothing in the browser reads these.
 * `src/lib/supabase/client.ts` exists but is imported by no component — every
 * authenticated read happens on the server, and `proxy.ts` refreshes the
 * session. If a client component ever needs `createBrowserClient`, it will
 * need the session cookie readable and this flag has to come off; that is a
 * deliberate trade to re-make at the time, not an accident to discover.
 *
 * `secure` is conditional so http://localhost still works — a Secure cookie is
 * dropped on a plain-http origin, which would make local sign-in fail in a way
 * that looks like wrong credentials.
 */
export function hardenAuthCookie(options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: options.sameSite ?? "lax",
  };
}
