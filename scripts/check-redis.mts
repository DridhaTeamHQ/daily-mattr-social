import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { OptionalRedisCache } from "../src/lib/cache/redis-core";
import { adminReadFetch } from "../src/lib/cache/admin-fetch";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) throw new Error("Redis REST configuration is missing");
const prefix = `dailymattr:smoke:${randomUUID()}`;
const configuredTimeout = Number(process.env.REDIS_CACHE_TIMEOUT_MS ?? 800);
const timeoutMs = Number.isFinite(configuredTimeout) ? Math.min(3000, Math.max(100, configuredTimeout)) : 800;
const commands: (string | number)[][] = [];
const testKeys = new Set<string>();
const redisFetch: typeof fetch = async (input, init) => {
  const args = JSON.parse(String(init?.body)) as (string | number)[];
  commands.push(args);
  if (args[0] === "SET" && String(args[1]).startsWith(`${prefix}:`)) testKeys.add(String(args[1]));
  return fetch(input, init);
};
const cache = new OptionalRedisCache({ url, token, prefix, timeoutMs }, redisFetch);
let sourceReads = 0;

try {
  const generation = await cache.generation("admin");
  assert.ok(generation, "Redis generation unavailable");
  testKeys.add(`${prefix}:generation:admin`);
  const fixtureRows = [{ id: "synthetic-campaign-1", title: "Cache verification fixture", status: "draft" }];
  const sourceFetch: typeof fetch = async (input) => {
    assert.equal(new URL(String(input)).origin, "https://database.example.test");
    sourceReads++;
    return Response.json(fixtureRows, {
      headers: { "set-cookie": "__cf_bm=synthetic; Path=/; HttpOnly; Secure; SameSite=None" },
    });
  };
  // Real Supabase SDK and Redis transport; synthetic source rows only.
  // No request is made to the user's database and no production row leaves it.
  const client = () => createClient("https://database.example.test", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: adminReadFetch({ cache,
      projectUrl: "https://database.example.test", actorId: "isolated-diagnostic",
      access: "service", generation: async () => generation, fetcher: sourceFetch }) },
  });
  const query = () => client().from("campaigns").select("id,title,status").order("id").limit(5);
  const first = await query();
  assert.equal(first.error, null, "Database query failed");
  const second = await query();
  assert.equal(second.error, null);
  assert.deepEqual(second.data, first.data);
  assert.equal(sourceReads, 1, "Second read should not query the source");

  const dataKey = [...testKeys].find(key => key.includes(":data:admin:campaigns:"));
  assert.ok(dataKey, "Query response was not stored");
  const raw = await redisFetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["GET", dataKey]), signal: AbortSignal.timeout(3000) });
  const stored = await raw.json();
  const envelope = JSON.parse(stored.result);
  assert.deepEqual(JSON.parse(envelope.data.body), first.data);
  assert.ok(!JSON.stringify(envelope).includes("__cf_bm"), "CDN cookies must not be stored");

  const before = await cache.generation("admin");
  const after = await cache.invalidate("admin");
  assert.ok(after);
  assert.notEqual(after, before);
  assert.equal(await cache.generation("admin"), after);
  const commandCount = commands.length;
  const stats = await cache.stats();
  assert.equal(commands.length, commandCount, "Diagnostics must not contact Redis");
  assert.ok(!commands.some(args => ["HINCRBY", "HGETALL", "INCR"].includes(String(args[0])) || JSON.stringify(args).includes(":metrics:")));
  console.log(JSON.stringify({ connection: stats.status, syntheticRowsStored: first.data?.length ?? 0,
    sourceQueriesForTwoReads: sourceReads, cachedResponseMatchesSource: true,
    redisMetricWrites: 0, hits: stats.rates.hits, misses: stats.rates.misses,
    adminInvalidation: "passed" }));
} catch {
  console.error("Redis cache verification failed. Credentials and cached values are not printed.");
  const stats = await cache.stats();
  console.error(JSON.stringify({ status: stats.status, reason: stats.lastFailure, local: stats.local, sourceReads }));
  process.exitCode = 1;
} finally {
  if (testKeys.size) {
    try {
      await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["DEL", ...testKeys]), signal: AbortSignal.timeout(3000) });
    } catch { /* Test data also expires automatically. */ }
  }
}
