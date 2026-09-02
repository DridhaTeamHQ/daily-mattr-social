import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client. **Bypasses RLS entirely.**
 *
 * This module is the only place `SUPABASE_SERVICE_ROLE_KEY` may be read. The
 * `server-only` import above turns any accidental client-side import into a
 * build error rather than a leaked key.
 *
 * Reach for it only where RLS genuinely cannot express the operation:
 *
 *   - crediting the point ledger after an approval (the ambassador must not be
 *     able to write their own points)
 *   - writing survey responses submitted by anonymous respondents
 *   - CSV referral imports
 *   - anything the deterministic screenshot pipeline writes
 *
 * Everywhere else, use `lib/supabase/server.ts` so RLS stays in force.
 */
export function createAdminClient(customFetch?: typeof fetch) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Missing environment variable SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill it in.",
    );
  }

  return createSupabaseClient<Database>(publicEnv.supabaseUrl, serviceRoleKey, {
    ...(customFetch ? { global: { fetch: customFetch } } : {}),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
