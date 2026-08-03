/**
 * Environment access.
 *
 * `NEXT_PUBLIC_*` values must be read as literal `process.env.X` expressions so
 * the Next.js compiler can inline them into the client bundle — destructuring
 * or dynamic lookup silently yields `undefined` in the browser.
 *
 * Server-only values live in `serverEnv()`, which throws if called from the
 * browser. Nothing here reads the service-role key; that belongs to
 * `lib/supabase/admin.ts` alone.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Safe on both server and client. */
export const publicEnv = {
  get supabaseUrl() {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabaseAnonKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  /**
   * @deprecated For shareable links use `getSiteUrl()` from `lib/site-url`,
   * which falls back to the request's own host. This getter returns whatever
   * is configured, which on a deployment with a stale value means handing
   * students a localhost URL.
   */
  get siteUrl() {
    return (
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
      "http://localhost:3000"
    );
  },
};

export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called in the browser");
  }

  return {
    /** Salt for hashing respondent IPs. Changing it resets duplicate detection. */
    get ipHashSalt() {
      return required("IP_HASH_SALT", process.env.IP_HASH_SALT);
    },
    /**
     * Optional. Without it the app skips AI adjudication entirely and every
     * submission that passes the deterministic checks goes to manual review.
     */
    get openaiApiKey() {
      return process.env.OPENAI_API_KEY || null;
    },
    get openaiVisionModel() {
      return process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
    },
  };
}

/** True when AI adjudication is configured. Auto-approval is off without it. */
export function aiAdjudicationEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Whether a Supabase project is wired up yet.
 *
 * Until one is, the app runs in **demo mode**: pages render fixture data so the
 * UI can be built and reviewed on localhost, auth is bypassed, and nothing is
 * persisted. Every screen shows a banner saying so. Fill the three Supabase
 * values in `.env.local` and demo mode switches itself off.
 *
 * Read literally, not via `publicEnv`, because those getters throw when unset.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
