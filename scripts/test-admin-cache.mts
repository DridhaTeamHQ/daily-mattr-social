import assert from "node:assert/strict";
import { test } from "node:test";
import { adminReadFetch } from "../src/lib/cache/admin-fetch";
import { OptionalRedisCache } from "../src/lib/cache/redis-core";

const origin = "https://project.supabase.co";

function harness() {
  const data = new Map<string, unknown>();
  const keys: string[] = [];
  let sourceReads = 0;
  let version: string | null = "revision-one";
  let source: () => Response = () => Response.json([{ id: "row" }]);
  const cache = {
    async remember<T>(key: string, _ttl: number, load: () => Promise<T>): Promise<T> {
      keys.push(key);
      if (data.has(key)) return data.get(key) as T;
      const value = await load();
      data.set(key, value);
      return value;
    },
  };
  const client = (actorId = "admin-a", access: "session" | "service" = "session") => adminReadFetch({
    cache, actorId, access, projectUrl: origin, generation: async () => version,
    fetcher: async () => { sourceReads++; return source(); },
  });
  return { client, keys, data, reads: () => sourceReads,
    version: (value: string | null) => { version = value; },
    source: (value: () => Response) => { source = value; } };
}

test("admin reads hit across renders and parallel layout/page requests deduplicate", async () => {
  const h = harness();
  const read = h.client();
  const url = `${origin}/rest/v1/profiles?select=id`;
  const results = await Promise.all([read(url), read(url)]);
  assert.deepEqual(await results[0].json(), [{ id: "row" }]);
  assert.deepEqual(await results[1].json(), [{ id: "row" }]);
  assert.deepEqual(await (await h.client()(url)).json(), [{ id: "row" }]);
  assert.equal(h.reads(), 1);
  assert.equal(h.keys.length, 2);
});

test("filters, pages, count mode, schema, method, actor and client role cannot collide", async () => {
  const h = harness();
  const base = `${origin}/rest/v1/profiles?select=id`;
  const read = h.client();
  await read(base);
  await read(base + "&city=eq.Hyderabad");
  await read(base, { headers: { Range: "0-999" } });
  await read(base, { headers: { Range: "1000-1999" } });
  await read(base, { headers: { Prefer: "count=exact" } });
  await read(base, { headers: { "Accept-Profile": "another_schema" } });
  await read(base, { method: "HEAD" });
  await h.client("admin-b")(base);
  await h.client("admin-a", "service")(base);
  assert.equal(new Set(h.keys).size, 9);
  assert.equal(h.reads(), 9);
});

test("RPC request bodies stay isolated and unknown or mutating RPCs are never cached", async () => {
  const h = harness();
  const read = h.client();
  for (const target of ["student-a", "student-b"]) {
    await read(`${origin}/rest/v1/rpc/ambassador_completion`, { method: "POST", body: JSON.stringify({ target }) });
  }
  for (const method of ["GET", "POST"]) {
    await read(`${origin}/rest/v1/rpc/approve_submission`, { method });
    await read(`${origin}/rest/v1/rpc/approve_submission`, { method });
  }
  assert.equal(h.data.size, 2);
  assert.equal(h.reads(), 6);
});

test("auth, storage signing, outside origins and table mutations bypass Redis", async () => {
  const h = harness();
  const read = h.client();
  for (const [url, method] of [
    [`${origin}/auth/v1/user`, "GET"], [`${origin}/storage/v1/object/sign/screenshots`, "POST"],
    ["https://other.supabase.co/rest/v1/profiles", "GET"],
    [`${origin}/rest/v1/profiles`, "POST"], [`${origin}/rest/v1/profiles`, "PATCH"],
    [`${origin}/rest/v1/profiles`, "DELETE"],
  ]) {
    await read(url, { method }); await read(url, { method });
  }
  assert.equal(h.data.size, 0);
  assert.equal(h.reads(), 12);
});

test("HEAD exact counts and paginated Content-Range survive cache hits", async () => {
  const h = harness();
  h.source(() => new Response(null, { status: 206, headers: { "content-range": "0-999/2317", "content-type": "application/json" } }));
  const url = `${origin}/rest/v1/submissions?select=id`;
  const init = { method: "HEAD", headers: { Prefer: "count=exact" } };
  await h.client()(url, init);
  const cached = await h.client()(url, init);
  assert.equal(cached.status, 206);
  assert.equal(cached.headers.get("content-range"), "0-999/2317");
  assert.equal(await cached.text(), "");
  assert.equal(h.reads(), 1);
});

test("a source error is returned unchanged, never cached, and retry can succeed", async () => {
  const h = harness();
  h.source(() => Response.json({ message: "database unavailable" }, { status: 503 }));
  const read = h.client();
  const url = `${origin}/rest/v1/profiles`;
  assert.equal((await read(url)).status, 503);
  assert.equal(h.data.size, 0);
  h.source(() => Response.json([{ id: "fresh" }]));
  assert.deepEqual(await (await read(url)).json(), [{ id: "fresh" }]);
  assert.equal(h.reads(), 2);
});

test("invalid JSON is not cached as a successful source response", async () => {
  const h = harness();
  h.source(() => new Response("not json"));
  const read = h.client();
  assert.equal(await (await read(`${origin}/rest/v1/profiles`)).text(), "not json");
  assert.equal(h.data.size, 0);
});

test("Supabase CDN cookies do not prevent data caching and are never replayed", async () => {
  const h = harness();
  h.source(() => Response.json([{ id: "row" }], {
    headers: { "set-cookie": "__cf_bm=synthetic; Path=/; HttpOnly; Secure; SameSite=None" },
  }));
  const url = `${origin}/rest/v1/profiles`;
  const first = await h.client()(url);
  const second = await h.client()(url);
  assert.deepEqual(await first.json(), [{ id: "row" }]);
  assert.deepEqual(await second.json(), [{ id: "row" }]);
  assert.equal(h.reads(), 1, "CDN cookie must not force a second database query");
  assert.equal(first.headers.has("set-cookie"), false);
  assert.equal(second.headers.has("set-cookie"), false);
  assert.ok(!JSON.stringify([...h.data.values()]).includes("synthetic"));
});

test("unknown session cookies still prevent caching", async () => {
  const h = harness();
  h.source(() => {
    const headers = new Headers();
    headers.append("set-cookie", "__cf_bm=synthetic; Path=/; HttpOnly");
    headers.append("set-cookie", "session=private; Path=/; HttpOnly");
    return Response.json([{ id: "row" }], { headers });
  });
  const url = `${origin}/rest/v1/profiles`;
  await h.client()(url);
  await h.client()(url);
  assert.equal(h.reads(), 2);
  assert.equal(h.data.size, 0);
});

test("credentials are absent from keys and cache snapshots", async () => {
  const h = harness();
  await h.client()(`${origin}/rest/v1/profiles`, { headers: { Authorization: "Bearer secret-token", apikey: "secret-key" } });
  assert.ok(!JSON.stringify([...h.data.entries()]).includes("secret"));
});

test("revision change skips old data even within the current render", async () => {
  const h = harness();
  const read = h.client();
  const url = `${origin}/rest/v1/profiles`;
  await read(url);
  h.version("revision-two");
  h.source(() => Response.json([{ id: "updated" }]));
  assert.deepEqual(await (await read(url)).json(), [{ id: "updated" }]);
  assert.equal(h.reads(), 2);
  assert.notEqual(h.keys[0], h.keys[1]);
});

test("an old fill finishing after invalidation cannot overwrite the new revision", async () => {
  const values = new Map<string, unknown>();
  let version = "before-edit";
  let release!: () => void;
  let started!: () => void;
  const isStarted = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  const client = adminReadFetch({
    projectUrl: origin, actorId: "admin-a", access: "session", generation: async () => version,
    cache: { async remember<T>(key: string, _ttl: number, load: () => Promise<T>): Promise<T> {
      if (values.has(key)) return values.get(key) as T;
      const result = await load(); values.set(key, result); return result;
    } },
    fetcher: async () => {
      reads++;
      if (reads === 1) { started(); await gate; return Response.json({ value: "old" }); }
      return Response.json({ value: "new" });
    },
  });
  const url = `${origin}/rest/v1/profiles`;
  const before = client(url);
  await isStarted;
  version = "after-edit";
  assert.deepEqual(await (await client(url)).json(), { value: "new" });
  release();
  assert.deepEqual(await (await before).json(), { value: "old" });
  assert.deepEqual(await (await client(url)).json(), { value: "new" });
  assert.equal(reads, 2);
});

test("missing revision bypasses all cached admin data", async () => {
  const h = harness();
  const read = h.client();
  const url = `${origin}/rest/v1/profiles`;
  await read(url);
  h.version(null);
  h.source(() => Response.json([{ id: "database-fallback" }]));
  assert.deepEqual(await (await read(url)).json(), [{ id: "database-fallback" }]);
  assert.equal(h.keys.length, 1);
  assert.equal(h.reads(), 2);
});

test("generation failures and invalidation failures fail open without fabricating hits/misses", async () => {
  const config = { url: "https://redis.test", token: "test", prefix: "test", timeoutMs: 20 };
  const offline = (async () => { throw Error("offline"); }) as typeof fetch;
  const readCache = new OptionalRedisCache(config, offline);
  assert.equal(await readCache.generation("admin"), null);
  assert.equal((await readCache.stats()).local.generationErrors, 1);
  const writeCache = new OptionalRedisCache(config, offline);
  assert.equal(await writeCache.invalidate("admin"), null);
  const stats = await writeCache.stats();
  assert.equal(stats.local.invalidationErrors, 1);
  assert.equal(stats.local.hits + stats.local.misses, 0);
});
