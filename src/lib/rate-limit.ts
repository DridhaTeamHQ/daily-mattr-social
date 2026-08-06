/**
 * A speed bump, not a wall.
 *
 * Counts requests per key in a fixed window, in memory. Being honest about
 * what that means: the memory belongs to one server instance, so on a platform
 * that runs several the real ceiling is the limit times the number of
 * instances. It stops a single script hammering one box; it does not stop a
 * distributed flood, and it is not a substitute for the platform's own
 * protection.
 *
 * It is deliberately generous. Two hundred students in a lecture hall share
 * one campus IP, and that crowd is the thing this app exists to serve — a
 * limit tuned to catch them would be the outage it was meant to prevent.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Stops the map growing without bound on a long-lived instance. */
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateVerdict = {
  ok: boolean;
  /** Seconds until the window resets. For the Retry-After header. */
  retryAfter: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateVerdict {
  sweep(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;
  return {
    ok: existing.count <= limit,
    retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** Only for tests: the map is process-wide and otherwise never reset. */
export function resetRateLimits() {
  windows.clear();
  lastSweep = 0;
}
