import "server-only";

import { googleSignInClientId } from "@/lib/google-signin";

export type GoogleIdentity = { email: string; name: string | null; sub: string };

/**
 * Checks a Google ID token (the `credential` Google Identity Services hands the
 * browser) and returns who it belongs to, or null if it isn't genuine.
 *
 * Verified with Google's tokeninfo endpoint rather than a local JWKS check: it
 * needs no new dependency, and Google itself checks the signature and expiry.
 * It is rate-limited, which is fine for a feature that only runs locally — swap
 * in `jose` + Google's JWKS before this goes anywhere near production traffic.
 *
 * The audience check is not optional. Without it, a token minted for any other
 * site's Google button would be accepted here as proof of identity.
 */
export async function verifyGoogleCredential(
  credential: string,
): Promise<GoogleIdentity | null> {
  const clientId = googleSignInClientId();
  if (!clientId || !credential) return null;

  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;

    const info = (await res.json()) as Record<string, string | undefined>;
    if (info.aud !== clientId) return null;
    if (info.iss !== "accounts.google.com" && info.iss !== "https://accounts.google.com") {
      return null;
    }
    if (info.email_verified !== "true" || !info.email || !info.sub) return null;
    if (Number(info.exp) * 1000 < Date.now()) return null;

    return {
      email: info.email.trim().toLowerCase(),
      name: info.name?.trim() || null,
      sub: info.sub,
    };
  } catch {
    return null;
  }
}
