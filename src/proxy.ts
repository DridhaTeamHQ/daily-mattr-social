import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { clientIp } from "@/lib/client-ip";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { hardenAuthCookie } from "@/lib/supabase/cookie-options";
import type { Database } from "@/lib/database.types";

/**
 * Session refresh.
 *
 * Next.js 16 renamed Middleware to Proxy; the behaviour is unchanged. Supabase
 * requires this layer: Server Components cannot write cookies, so a refreshed
 * access token would otherwise be computed and then thrown away, logging users
 * out at random.
 *
 * This does optimistic redirects only. Real authorization lives in RLS and in
 * each route's own checks — never trust a proxy redirect as the security
 * boundary.
 */

/** Prefixes that require a signed-in user. */
const PROTECTED = ["/dashboard", "/admin"];

/**
 * What a burst on each public entrance is allowed to look like, per IP per
 * minute.
 *
 * Tuned for a crowd, not for a single person. A campus shares one address, so
 * these have to sit above "a lecture hall opens the link at once" and below
 * "a script is working through the alphabet". The two auth routes are tighter
 * because each attempt is a password guess or an email we pay to send.
 */
const LIMITS: { prefix: string; perMinute: number }[] = [
  { prefix: "/forgot-password", perMinute: 60 },
  { prefix: "/login", perMinute: 240 },
  { prefix: "/r/", perMinute: 600 },
  { prefix: "/s/", perMinute: 600 },
];

const WINDOW_MS = 60_000;

/**
 * Whether this request could possibly have a session to refresh.
 *
 * Supabase stores its tokens in cookies prefixed `sb-`. A visitor who has
 * never signed in has none, and building a Supabase client to discover that
 * costs work on exactly the traffic there is most of — the stranger opening a
 * survey link. Protected paths still go through the full check, because that
 * is where the redirect decision is made.
 */
function couldHaveSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Rate limit ───────────────────────────────────────────────────────────
  const limit = LIMITS.find((l) => pathname.startsWith(l.prefix));
  if (limit) {
    const verdict = rateLimit(
      `${limit.prefix}:${clientIp(request.headers) ?? "unknown"}`,
      limit.perMinute,
      WINDOW_MS,
    );
    if (!verdict.ok) {
      return new NextResponse("Too many requests. Try again shortly.", {
        status: 429,
        headers: {
          "retry-after": String(verdict.retryAfter),
          "cache-control": "no-store",
        },
      });
    }
  }

  // Demo mode: no project to refresh a session against, and no auth to
  // enforce. Let every request through untouched.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const needsAuth = PROTECTED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Nothing to refresh and nothing to guard: skip the client entirely.
  if (!needsAuth && !couldHaveSession(request)) {
    return NextResponse.next({ request });
  }

  // Must be built from the incoming request so cookies set below survive.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, hardenAuthCookie(options));
          }
          // Responses that set auth cookies must never be cached by a CDN, or
          // one student's session token gets served to another.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Do this before generating a response: a refresh that lands after the
  // response is committed cannot write its cookies and will be lost.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (needsAuth && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. The public survey route
     * (/s/[slug]) is matched too — refreshing a session there is harmless, and
     * an ambassador previewing their own link should stay signed in.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
