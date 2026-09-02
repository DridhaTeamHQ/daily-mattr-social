import { createHash } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) throw new Error("Redis configuration is missing");
const project = createHash("sha256").update(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "unconfigured").digest("hex").slice(0, 12);
const prefixes = ["development", "production", "preview", "test"].map(env => `dailymattr:${project}:${env}:v1`);
if (process.env.REDIS_CACHE_PREFIX?.trim()) prefixes.push(process.env.REDIS_CACHE_PREFIX.trim());
const removeMetrics = process.argv.includes("--remove-legacy-metrics");

async function command(args: (string | number)[]) {
  const response = await fetch(url!, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args), signal: AbortSignal.timeout(5000) });
  const body = await response.json();
  if (!response.ok || body.error || !("result" in body)) throw new Error("Redis command failed");
  return body.result;
}

try {
  const matching = new Set<string>();
  for (const prefix of new Set(prefixes)) {
    // Restrict glob syntax to our own trailing '*', even for a custom prefix.
    const literalPrefix = prefix.replace(/([*?[\]\\])/g, "\\$1");
    let cursor = "0";
    let pages = 0;
    do {
      const result = await command(["SCAN", cursor, "MATCH", `${literalPrefix}:*`, "COUNT", 100]);
      cursor = String(result[0]);
      for (const key of result[1] as string[]) {
        if (key.startsWith(`${prefix}:`)) matching.add(key);
      }
      if (++pages > 1000) throw new Error("Inventory limit reached");
    } while (cursor !== "0");
  }

  const legacy = [...matching].filter(key => prefixes.some(prefix =>
    key.startsWith(`${prefix}:metrics:`) && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(`${prefix}:metrics:`.length))));
  // The removal flag can only delete verified daily metric hashes for this app.
  // No data/generation keys, database rows, SCAN matches or FLUSH commands are deleted.
  if (removeMetrics && legacy.length) await command(["DEL", ...legacy]);
  const remaining = [...matching].filter(key => !removeMetrics || !legacy.includes(key));
  console.log(JSON.stringify({ legacyMetricKeys: legacy.length,
    removedLegacyMetricKeys: removeMetrics ? legacy.length : 0,
    remaining: await Promise.all(remaining.map(async key => ({ key, ttlSeconds: await command(["TTL", key]) }))) }));
} catch {
  console.error("Redis inventory/cleanup failed. No credentials or stored data were printed.");
  process.exitCode = 1;
}
