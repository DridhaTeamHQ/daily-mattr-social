import assert from "node:assert/strict";
import { test } from "node:test";
import { OptionalRedisCache, percentages, MAX_CACHE_BYTES, type RedisConfig } from "../src/lib/cache/redis-core";

const config: RedisConfig = { url: "https://redis.test", token: "test-only", prefix: "test", timeoutMs: 20 };
const reply = (result: unknown) => Response.json({ result });
const fake = (fn: (args: (string | number)[]) => Promise<Response> | Response) =>
  (async (_url, init) => fn(JSON.parse(String(init?.body)))) as typeof fetch;

test("percentages share the correct denominator; no traffic is undefined", () => {
  assert.deepEqual(percentages(0, 0), { hits: 0, misses: 0, lookups: 0, hitPercent: null, missPercent: null });
  assert.equal(percentages(3, 1).hitPercent, 75);
  assert.equal(percentages(3, 1).missPercent, 25);
});

test("disabled Redis calls the original loader without network", async () => {
  const cache = new OptionalRedisCache(null, fake(() => { throw Error("must not call"); }));
  assert.equal(await cache.remember("x", 30, async () => "database"), "database");
  const stats = await cache.stats();
  assert.equal(stats.status, "disabled");
  assert.equal(stats.local.disabled, 1);
  assert.equal(stats.rates.lookups, 0);
});

test("cold miss writes expiring data, then hits skip the database", async () => {
  let stored: unknown = null;
  let loads = 0;
  const cache = new OptionalRedisCache(config, fake((args) => {
    if (args[0] === "GET") return reply(stored);
    if (args[0] === "SET") {
      assert.equal(args[3], "EX"); assert.equal(args[4], 30);
      stored = args[2]; return reply("OK");
    }
    throw new Error("Unexpected Redis command");
  }));
  const load = async () => { loads++; return { total: 7 }; };
  for (let i = 0; i < 3; i++) assert.deepEqual(await cache.remember("x", 30, load), { total: 7 });
  assert.equal(loads, 1);
  const stats = await cache.stats();
  assert.equal(stats.rates.hits, 2);
  assert.equal(stats.rates.misses, 1);
  assert.equal(stats.local.hits, 2);
  assert.equal(stats.local.misses, 1);
});

for (const value of [null, false, 0, "", []]) {
  test(`cached JSON value ${JSON.stringify(value)} is a hit`, async () => {
    const cache = new OptionalRedisCache(config, fake(() => reply(JSON.stringify({ version: 1, data: value }))));
    assert.deepEqual(await cache.remember("x", 1, async () => { throw Error("unexpected load"); }), value);
  });
}

for (const mode of ["network", "unauthorized", "quota", "command-error", "malformed"] as const) {
  test(`${mode} falls back once and opens the circuit`, async () => {
    let calls = 0;
    const cache = new OptionalRedisCache(config, fake(() => {
      calls++;
      if (mode === "network") throw Error("network error with sensitive provider details");
      if (mode === "unauthorized") return new Response("private provider detail", { status: 401 });
      if (mode === "quota") return new Response("quota", { status: 429 });
      if (mode === "command-error") return Response.json({ error: "ERR max requests limit exceeded" }, { status: 400 });
      return reply("invalid JSON");
    }));
    let loads = 0;
    const load = async () => ++loads;
    assert.equal(await cache.remember("x", 30, load), 1);
    assert.equal(await cache.remember("x", 30, load), 2);
    const stats = await cache.stats();
    assert.equal(calls, 1);
    assert.equal(stats.status, "fallback");
    assert.equal(stats.rates.lookups, 0);
    assert.equal(stats.local.readErrors, 1);
    assert.equal(stats.local.misses, 0);
    assert.equal(stats.local.circuitBypasses, 1);
  });
}

test("deadline covers stalled response body and falls back", async () => {
  const cache = new OptionalRedisCache(config, fake(() => new Response(new ReadableStream())));
  const started = Date.now();
  assert.equal(await cache.remember("x", 30, async () => "database"), "database");
  assert.ok(Date.now() - started < 500);
  assert.equal((await cache.stats()).lastFailure, "timeout");
});

test("write failure preserves successful DB result and does not load again", async () => {
  const cache = new OptionalRedisCache(config, fake((args) => {
    if (args[0] === "GET") return reply(null);
    throw Error("write failed");
  }));
  let loads = 0;
  assert.equal(await cache.remember("x", 30, async () => ++loads), 1);
  const stats = await cache.stats();
  assert.equal(stats.local.misses, 1);
  assert.equal(stats.local.writeErrors, 1);
  assert.equal(loads, 1);
});

test("source failure is never cached or retried", async () => {
  let calls = 0;
  const cache = new OptionalRedisCache(config, fake(() => { calls++; return reply(null); }));
  const failure = Error("database failed");
  await assert.rejects(cache.remember("x", 30, async () => { throw failure; }), failure);
  assert.equal(calls, 1);
});

test("circuit resumes after cooldown and quota uses five minutes", async () => {
  let now = Date.UTC(2026, 8, 2);
  let fail = true;
  const cache = new OptionalRedisCache(config, fake((args) => {
    if (fail) return new Response("quota", { status: 429 });
    assert.equal(args[0], "GET");
    return reply(JSON.stringify({ version: 1, data: "cached" }));
  }), () => now);
  await cache.remember("x", 30, async () => "database");
  assert.equal((await cache.stats()).retryAt, new Date(now + 300_000).toISOString());
  fail = false;
  now += 300_001;
  assert.equal(await cache.remember("x", 30, async () => "database"), "cached");
  assert.equal((await cache.stats()).status, "connected");
});

test("oversized data is returned without spending a SET command", async () => {
  let calls = 0;
  const cache = new OptionalRedisCache(config, fake(() => { calls++; return reply(null); }));
  const value = "x".repeat(MAX_CACHE_BYTES);
  assert.equal(await cache.remember("x", 30, async () => value), value);
  assert.equal(calls, 1);
});

test("diagnostics stay in memory and issue no Redis commands", async () => {
  let calls = 0;
  const cache = new OptionalRedisCache(config, fake(() => { calls++; throw Error("must not call"); }));
  const initial = await cache.stats();
  assert.equal(initial.status, "ready");
  assert.equal(initial.scope, "server-instance");
  assert.equal(initial.rates.hitPercent, null);
  assert.equal(calls, 0);
});

test("repeated data reads use only GET and SET, never Redis metrics", async () => {
  let stored: unknown = null;
  const commands: (string | number)[][] = [];
  const cache = new OptionalRedisCache(config, fake(args => {
    commands.push(args);
    if (args[0] === "GET") return reply(stored);
    assert.equal(args[0], "SET");
    stored = args[2];
    return reply("OK");
  }));
  const data = { rows: [{ id: "campaign-1", title: "Campus campaign" }] };
  await cache.remember("campaigns", 300, async () => data);
  assert.deepEqual(await cache.remember("campaigns", 300, async () => { throw Error("must not load DB"); }), data);
  const stats = await cache.stats();
  assert.deepEqual(commands.map(args => args[0]), ["GET", "SET", "GET"]);
  assert.equal(stats.local.writes, 1);
  assert.equal(stats.rates.hitPercent, 50);
  assert.ok(!JSON.stringify(commands).includes(":metrics:"));
  assert.equal((await new OptionalRedisCache(config).stats()).rates.lookups, 0);
});

test("database results larger than the old 256 KiB limit are cached", async () => {
  let stored: unknown = null;
  const cache = new OptionalRedisCache(config, fake(args => {
    if (args[0] === "GET") return reply(stored);
    stored = args[2]; return reply("OK");
  }));
  const rows = [{ text: "x".repeat(300 * 1024) }];
  await cache.remember("large-page", 300, async () => rows);
  assert.deepEqual(await cache.remember("large-page", 300, async () => { throw Error("unexpected DB read"); }), rows);
  assert.equal((await cache.stats()).local.writes, 1);
});
