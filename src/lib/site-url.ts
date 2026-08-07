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
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`, which the platform sets
 *     itself. A deploy that forgot step 1 still gets its own real domain.
 *  3. The incoming request's host — but ONLY when it is one we already trust.
 *  4. localhost, for the rare non-request context.
 *
 * ─── Why the request host is no longer trusted on its own ───────────────────
 *
 * This function also builds the password-reset link that goes out by email,
 * and `Host` / `x-forwarded-host` are attacker-controlled. Sending a reset
 * request with a forged host made Supabase email the victim a real reset token
 * pointed at the attacker's domain: the victim clicks their own genuine email,
 * the token lands on someone else's server, and the account — including an
 * admin's — is taken over. Nothing about the email looks wrong.
 *
 * So the host is now matched against an allowlist. An unrecognised host falls
 * back to the configured origin rather than being echoed back into a link.
 */

/** Hosts we will build links for, beyond whatever is configured. */
function allowedHosts(): string[] {
  return [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) =>
      value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase(),
    );
}

function fromEnv(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");

  // A configured localhost value is almost always a .env.example left in place
  // on a deployed environment, so it does not win on a deployment.
  if (configured && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(configured)) {
    return configured;
  }

  // Set by Vercel on every deployment, and not forgeable by a request.
  const platform =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (platform) return `https://${platform.replace(/^https?:\/\//, "")}`;

  return configured || null;
}

export async function getSiteUrl(): Promise<string> {
  const env = fromEnv();
  if (env && !/localhost|127\.0\.0\.1/i.test(env)) return env;

  try {
    const headerList = await headers();

    // Vercel and most proxies set x-forwarded-host; `host` is the direct one.
    const host = (
      headerList.get("x-forwarded-host") ??
      headerList.get("host") ??
      ""
    )
      .split(",")[0]
      .trim()
      .toLowerCase();

    // Local development is the one case where an unlisted host is fine — it
    // cannot be reached by an attacker, and requiring configuration to run the
    // app locally is how people end up disabling the check entirely.
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);

    if (host && (isLocal || allowedHosts().includes(host))) {
      const proto = isLocal ? "http" : "https";
      return `${proto}://${host}`;
    }
  } catch {
    // headers() throws outside a request scope.
  }

  return env || "http://localhost:3000";
}
