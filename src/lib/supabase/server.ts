import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import { hardenAuthCookie } from "@/lib/supabase/cookie-options";
import type { Database } from "@/lib/database.types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Create a new one per request — never hoist it to module scope, or one user's
 * session leaks into another's render.
 *
 * `cookies()` is async in Next.js 16, so this is async too.
 */
export async function createClient(customFetch?: typeof fetch) {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      ...(customFetch ? { global: { fetch: customFetch } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, hardenAuthCookie(options));
            }
          } catch {
            // Server Components cannot write cookies. That is fine: `proxy.ts`
            // refreshes the session on every matched request, so the tokens
            // this call wanted to persist have already been written there.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null.
 *
 * Always prefer this over `getSession()` on the server — it verifies the JWT
 * with the auth server instead of trusting whatever is in the cookie.
 */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The signed-in user's profile row, or null when signed out or not yet
 * provisioned. Role and status live here, not on the auth user.
 */
export async function getProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data;
}
