import "server-only";

import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

import { googleSignInClientId } from "@/lib/google-signin";

export type GoogleIdentity = { email: string; name: string | null; sub: string };

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
/** Slack for the clock on this server and Google's disagreeing. */
const SKEW_SECONDS = 60;

type Jwk = JsonWebKey & { kid: string };

/**
 * Google's signing keys, kept for as long as Google says they are good for.
 *
 * Verified here rather than by asking Google's tokeninfo endpoint about every
 * token: that endpoint is rate-limited and meant for debugging, and a survey
 * link shared in a lecture hall is sixty sign-ins in the same minute. The keys
 * rotate every few days and Google sends a max-age with them.
 */
let cached: { keys: Jwk[]; expires: number } | null = null;

async function googleKeys(forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && cached && cached.expires > Date.now()) return cached.keys;

  const res = await fetch(CERTS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Google certs ${res.status}`);

  const { keys } = (await res.json()) as { keys: Jwk[] };
  const maxAge = Number(
    /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600,
  );
  cached = { keys, expires: Date.now() + maxAge * 1000 };
  return keys;
}

function decodePart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

/**
 * Checks a Google ID token (the `credential` Google Identity Services hands the
 * browser) and returns who it belongs to, or null if it isn't genuine.
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
    const [headerPart, payloadPart, signaturePart] = credential.split(".");
    if (!headerPart || !payloadPart || !signaturePart) return null;

    const header = decodePart<{ alg?: string; kid?: string }>(headerPart);
    if (header.alg !== "RS256" || !header.kid) return null;

    // A kid we have not seen is usually a rotation that happened since the
    // keys were cached, so look once more before calling the token forged.
    let jwk = (await googleKeys()).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const valid = verify(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(signaturePart, "base64url"),
    );
    if (!valid) return null;

    const claims = decodePart<{
      aud?: string;
      iss?: string;
      exp?: number;
      iat?: number;
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
    }>(payloadPart);

    const now = Date.now() / 1000;
    if (claims.aud !== clientId) return null;
    if (!claims.iss || !ISSUERS.has(claims.iss)) return null;
    if (!claims.exp || claims.exp + SKEW_SECONDS < now) return null;
    if (claims.iat && claims.iat - SKEW_SECONDS > now) return null;
    if (claims.email_verified !== true && claims.email_verified !== "true") return null;
    if (!claims.email || !claims.sub) return null;

    return {
      email: claims.email.trim().toLowerCase(),
      name: claims.name?.trim() || null,
      sub: claims.sub,
    };
  } catch (error) {
    console.error("google credential check failed", error);
    return null;
  }
}
