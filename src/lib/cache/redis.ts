import "server-only";

import { createHash } from "node:crypto";
import { OptionalRedisCache, type RedisConfig } from "./redis-core";

function configuration(): RedisConfig | null {
  if (process.env.REDIS_CACHE_ENABLED === "false") return null;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  } catch { return null; }
  const project = createHash("sha256").update(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "unconfigured").digest("hex").slice(0, 12);
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
  const timeout = Number(process.env.REDIS_CACHE_TIMEOUT_MS ?? 800);
  return {
    url: url.replace(/\/$/, ""), token,
    prefix: process.env.REDIS_CACHE_PREFIX?.trim() || `dailymattr:${project}:${environment}:v1`,
    timeoutMs: Number.isFinite(timeout) ? Math.min(3000, Math.max(100, timeout)) : 800,
  };
}

// Keep the breaker and local diagnostics through development module reloads.
const globals = globalThis as typeof globalThis & { optionalRedisCacheV3?: OptionalRedisCache };
export const redisCache = globals.optionalRedisCacheV3 ??= new OptionalRedisCache(configuration());
