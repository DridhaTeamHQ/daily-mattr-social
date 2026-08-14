/**
 * The address to hold a caller to.
 *
 * `x-forwarded-for` is a list, and the LEFTMOST entry is whatever the client
 * sent — a header, not an observation. Reading it as the caller's address means
 * `X-Forwarded-For: <random>` per request gives every request its own identity,
 * so anything keyed on it silently stops working: a rate limiter that never
 * fires, a duplicate check that never matches.
 *
 * The header is only trustworthy from the right. Each proxy appends the peer it
 * actually saw, so the last entry is the one our edge observed and the earliest
 * one a client cannot forge. Vercel also sets `x-vercel-forwarded-for` itself,
 * which a request cannot influence at all, so that wins where it exists.
 *
 * `proxy.ts` learned this and fixed it locally; the survey and referral paths
 * still read the leftmost value, so the logic lives here now and all three
 * callers share it.
 */
export function clientIp(headers: Headers): string | null {
  const trusted = headers.get("x-vercel-forwarded-for")?.trim();
  if (trusted) return trusted;

  const chain = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (chain?.length) return chain[chain.length - 1];

  return headers.get("x-real-ip")?.trim() || null;
}
