import { createHash } from "node:crypto";
import type { OptionalRedisCache } from "./redis-core";

export const ADMIN_CACHE_TTL = 300;
const READ_RPCS = new Set(["completion_leaderboard", "ambassador_completion", "stipend_eligibility"]);
const KEY_HEADERS = ["accept", "accept-profile", "content-profile", "prefer", "range", "range-unit"];
const RESPONSE_HEADERS = ["content-type", "content-range", "range-unit", "preference-applied"];
const CDN_COOKIES = new Set(["__cf_bm", "_cfuvid"]);

function hasSessionCookie(headers: Headers): boolean {
  if (!headers.has("set-cookie")) return false;
  const cookies = headers.getSetCookie?.();
  // Fail closed if this runtime cannot separate multiple Set-Cookie headers.
  if (!cookies?.length) return true;
  return cookies.some(cookie => !CDN_COOKIES.has(cookie.slice(0, cookie.indexOf("=")).trim()));
}

type Snapshot = { body: string; status: number; headers: [string, string][] };
class UncacheableResponse {
  constructor(readonly response: Response) {}
}

/** Called only with a freshly verified admin context, never a browser input. */
export function adminReadFetch(options: {
  cache: Pick<OptionalRedisCache, "remember">;
  projectUrl: string;
  actorId: string;
  access: "session" | "service";
  generation: () => Promise<string | null>;
  fetcher?: typeof fetch;
}): typeof fetch {
  const fetcher = options.fetcher ?? fetch;
  const projectOrigin = new URL(options.projectUrl).origin;
  // Collapses duplicate layout/page reads only within this client/render.
  const pending = new Map<string, Promise<Snapshot>>();

  return async (input, init) => {
    // Supabase uses URL strings. Do not consume/reconstruct arbitrary Request bodies.
    if (input instanceof Request) return fetcher(input, init);
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const rpc = url.pathname.startsWith("/rest/v1/rpc/") ? url.pathname.slice("/rest/v1/rpc/".length) : null;
    const isRead = rpc ? READ_RPCS.has(rpc) && ["GET", "HEAD", "POST"].includes(method) : ["GET", "HEAD"].includes(method);
    if (url.origin !== projectOrigin || !url.pathname.startsWith("/rest/v1/") || !isRead || (init?.body != null && typeof init.body !== "string")) {
      return fetcher(input, init);
    }

    const generation = await options.generation();
    // No revision means Redis is disabled/unavailable: do not reuse old data.
    if (generation === null) return fetcher(input, init);
    const headers = new Headers(init?.headers);
    const signature = JSON.stringify([options.actorId, options.access, url.href, method,
      init?.body ?? null, KEY_HEADERS.map(name => [name, headers.get(name)])]);
    const resource = rpc ?? url.pathname.slice("/rest/v1/".length);
    const key = `admin:${resource}:${generation}:${createHash("sha256").update(signature).digest("hex")}`;

    let task = pending.get(key);
    if (!task) {
      task = options.cache.remember<Snapshot>(key, ADMIN_CACHE_TTL, async () => {
        const response = await fetcher(input, init);
        // Supabase's CDN sets __cf_bm on normal database responses. It must not
        // disable row caching. No cookies are stored or replayed: only the data
        // headers allowlisted below survive. Unknown session cookies still bypass.
        if (!response.ok || hasSessionCookie(response.headers)) throw new UncacheableResponse(response);
        const body = await response.text();
        if (method !== "HEAD" && body) {
          try { JSON.parse(body); }
          catch { throw new UncacheableResponse(new Response(body, { status: response.status, headers: response.headers })); }
        }
        const savedHeaders: [string, string][] = [];
        for (const name of RESPONSE_HEADERS) {
          const value = response.headers.get(name);
          if (value !== null) savedHeaders.push([name, value]);
        }
        return { body, status: response.status, headers: savedHeaders };
      });
      pending.set(key, task);
    }
    try {
      const saved = await task;
      return new Response(method === "HEAD" || [204, 205, 304].includes(saved.status) ? null : saved.body,
        { status: saved.status, headers: saved.headers });
    } catch (error) {
      // A later readAll retry must execute a fresh DB read after a source error.
      pending.delete(key);
      if (error instanceof UncacheableResponse) return error.response.clone();
      throw error;
    }
  };
}
