import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isSupabaseConfigured, publicEnv } from "@/lib/env";
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

export async function proxy(request: NextRequest) {
  // Demo mode: no project to refresh a session against, and no auth to
  // enforce. Let every request through untouched.
  if (!isSupabaseConfigured()) {
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
            response.cookies.set(name, value, options);
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

  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

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
