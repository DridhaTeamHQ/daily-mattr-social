"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Supabase client for Client Components.
 *
 * `createBrowserClient` is a singleton by default, so calling this on every
 * render is cheap and returns the same instance. Cookie handling is left
 * unconfigured on purpose — the library's `document.cookie` fallback is what
 * keeps the browser session in step with the cookies `proxy.ts` refreshes.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
  );
}
