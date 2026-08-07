/**
 * The 1000-ambassador stress test.
 *
 * Four separate questions, because "can it take a thousand people" is really
 * four different failure modes and they fail in different places:
 *
 *   1. signup     — 1000 accounts created at once. Referral codes must all be
 *                   unique, and the code generator is the one thing here with
 *                   an obvious contention bug in it.
 *   2. crowd      — 1000 visitors on the public pages at once. Measures the
 *                   request path and whether the rate limiter refuses real
 *                   people.
 *   3. click      — 1000 visitors on ONE survey link at once. The click
 *                   counter used to read-then-write and lost 93% of a burst;
 *                   this checks the count lands where it should.
 *   4. size       — with 1000 ambassadors in the table, do the admin pages
 *                   still render, and how long do they take.
 *
 * Usage:
 *   npx tsx scripts/stress-1000.mts <base-url> [--n 1000] [--only signup,crowd,click,size]
 *
 * Everything it creates is tagged `stress.<run>@loadtest.invalid` so the
 * cleanup at the end can find it. Run `--cleanup` alone to remove leftovers
 * from an interrupted run.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";

function flag(name: string, fallback: number): number {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
}
function list(name: string, fallback: string[]): string[] {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1].split(",") : fallback;
}

const N = flag("n", 1000);
const only = list("only", ["signup", "crowd", "click", "size"]);
const cleanupOnly = args.includes("--cleanup");

const EMAIL_DOMAIN = "loadtest.invalid";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Run `jobs` with at most `limit` in flight. Unbounded would open 1000 sockets. */
async function pool<T>(
  jobs: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]();
      }
    }),
  );
  return out;
}

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const at = (p: number) =>
    s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]) : 0;
  return { p50: at(50), p95: at(95), p99: at(99), max: at(100) };
}

function table(rows: Record<string, string | number>[]) {
  console.table(rows);
}

// ─── 1. Signup storm ────────────────────────────────────────────────────────

async function signupStorm(): Promise<string[]> {
  console.log(`\n─── 1. ${N} ambassadors sign up at once`);

  const times: number[] = [];
  const errors = new Map<string, number>();

  const jobs = Array.from({ length: N }, (_, i) => async () => {
    const started = performance.now();
    const { data, error } = await db.auth.admin.createUser({
      email: `stress.${i}@${EMAIL_DOMAIN}`,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: {
        full_name: `Stress ${i}`,
        college: `College ${i % 40}`,
        city: ["Hyderabad", "Vijayawada", "Warangal"][i % 3],
        batch: `Batch ${String.fromCharCode(65 + (i % 6))}`,
      },
    });
    times.push(performance.now() - started);
    if (error) {
      const key = error.message.slice(0, 60);
      errors.set(key, (errors.get(key) ?? 0) + 1);
      return null;
    }
    return data.user?.id ?? null;
  });

  const wall = performance.now();
  const ids = (await pool(jobs, 25)).filter(Boolean) as string[];
  const elapsed = (performance.now() - wall) / 1000;

  // handle_new_user carries full_name, phone and college out of the metadata
  // but not city or batch, so those are set here. Without them every seeded
  // ambassador lands in "Unassigned" and the grouping half of the size test
  // measures one enormous group, which is the one case it cannot fail on.
  await pool(
    ["Hyderabad", "Vijayawada", "Warangal"].flatMap((city, c) =>
      Array.from({ length: 6 }, (_, b) => async () => {
        const batch = `Batch ${String.fromCharCode(65 + b)}`;
        // i % 3 chose the city and i % 6 the batch at signup, so the same
        // arithmetic picks them back out of the email.
        const wanted = Array.from({ length: N }, (_, i) => i).filter(
          (i) => i % 3 === c && i % 6 === b,
        );
        if (wanted.length === 0) return;
        await db
          .from("profiles")
          .update({ city, batch })
          .in(
            "email",
            wanted.map((i) => `stress.${i}@${EMAIL_DOMAIN}`),
          );
      }),
    ),
    6,
  );

  const { count: profiles } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "ambassador");

  // The interesting one. Codes are generated per signup; a race gives two
  // people the same code, and a referral then credits the wrong ambassador.
  const { data: codes } = await db
    .from("profiles")
    .select("referral_code")
    .eq("role", "ambassador");
  const unique = new Set((codes ?? []).map((c) => c.referral_code)).size;

  table([
    { metric: "created", value: ids.length },
    { metric: "failed", value: N - ids.length },
    { metric: "wall clock", value: `${elapsed.toFixed(1)} s` },
    { metric: "rate", value: `${(ids.length / elapsed).toFixed(1)} signups/s` },
    { metric: "per signup p50", value: `${stats(times).p50} ms` },
    { metric: "per signup p95", value: `${stats(times).p95} ms` },
    { metric: "per signup max", value: `${stats(times).max} ms` },
    { metric: "profiles in table", value: profiles ?? 0 },
    { metric: "referral codes", value: `${codes?.length ?? 0} rows` },
    { metric: "codes unique", value: unique },
    {
      metric: "DUPLICATE CODES",
      value: (codes?.length ?? 0) - unique,
    },
  ]);
  if (errors.size) console.log("errors:", Object.fromEntries(errors));

  return ids;
}

// ─── 2. Crowd on the public pages ───────────────────────────────────────────

async function crowd(paths: string[], label: string, users = N, seconds = 12) {
  console.log(`\n─── 2. ${users} visitors on ${label} for ${seconds}s`);

  const times: number[] = [];
  const codes = new Map<string | number, number>();
  const deadline = Date.now() + seconds * 1000;
  let done = 0;

  async function visitor(id: number) {
    while (Date.now() < deadline) {
      const path = paths[(id + done) % paths.length];
      const started = performance.now();
      try {
        const res = await fetch(base + path, {
          redirect: "manual",
          headers: {
            "user-agent": `stress/${id}`,
            // A crowd is a thousand addresses, not one. The limiter keys on
            // the address, so sending them all from one machine's IP would
            // measure the limiter rather than the app.
            "x-forwarded-for": `10.${(id >> 16) & 255}.${(id >> 8) & 255}.${id & 255}`,
          },
        });
        await res.arrayBuffer().catch(() => undefined);
        times.push(performance.now() - started);
        codes.set(res.status, (codes.get(res.status) ?? 0) + 1);
      } catch (err) {
        times.push(performance.now() - started);
        const key = err instanceof Error ? err.message.slice(0, 40) : "error";
        codes.set(key, (codes.get(key) ?? 0) + 1);
      }
      done += 1;
    }
  }

  const wall = performance.now();
  await Promise.all(Array.from({ length: users }, (_, i) => visitor(i)));
  const elapsed = (performance.now() - wall) / 1000;
  const s = stats(times);

  table([
    { metric: "requests", value: done },
    { metric: "throughput", value: `${(done / elapsed).toFixed(1)} req/s` },
    { metric: "p50", value: `${s.p50} ms` },
    { metric: "p95", value: `${s.p95} ms` },
    { metric: "p99", value: `${s.p99} ms` },
    { metric: "max", value: `${s.max} ms` },
    {
      metric: "responses",
      value: [...codes].map(([c, n]) => `${c}×${n}`).join("  "),
    },
  ]);
}

// ─── 3. One survey link, 1000 at once ───────────────────────────────────────

async function clickStorm(ambassadorId: string) {
  console.log(`\n─── 3. ${N} visitors on ONE survey link`);

  const { data: survey } = await db
    .from("surveys")
    .insert({
      title: "Stress test survey",
      status: "live",
      points_per_response: 1,
    })
    .select("id")
    .single();
  if (!survey) return console.log("could not create the survey — skipped");

  const slug = `st${Math.random().toString(36).slice(2, 9)}`;
  const { data: link } = await db
    .from("survey_links")
    .insert({ survey_id: survey.id, ambassador_id: ambassadorId, slug })
    .select("id")
    .single();
  if (!link) return console.log("could not create the link — skipped");

  const times: number[] = [];
  const codes = new Map<string | number, number>();

  const jobs = Array.from({ length: N }, (_, i) => async () => {
    const started = performance.now();
    try {
      const res = await fetch(`${base}/s/${slug}`, {
        redirect: "manual",
        headers: {
          "user-agent": `stress/${i}`,
          "x-forwarded-for": `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`,
        },
      });
      await res.arrayBuffer().catch(() => undefined);
      codes.set(res.status, (codes.get(res.status) ?? 0) + 1);
    } catch (err) {
      const key = err instanceof Error ? err.message.slice(0, 40) : "error";
      codes.set(key, (codes.get(key) ?? 0) + 1);
    }
    times.push(performance.now() - started);
  });

  const wall = performance.now();
  await pool(jobs, 200);
  const elapsed = (performance.now() - wall) / 1000;

  // The counter is written after the response goes out and coalesced, so give
  // the writes a moment to land before reading the total.
  await new Promise((r) => setTimeout(r, 6000));
  const { data: counted } = await db
    .from("survey_links")
    .select("click_count")
    .eq("id", link.id)
    .single();

  const served = [...codes]
    .filter(([c]) => c === 200)
    .reduce((n, [, v]) => n + v, 0);
  const s = stats(times);

  table([
    { metric: "requests", value: N },
    { metric: "served 200", value: served },
    { metric: "wall clock", value: `${elapsed.toFixed(1)} s` },
    { metric: "throughput", value: `${(N / elapsed).toFixed(1)} req/s` },
    { metric: "p50", value: `${s.p50} ms` },
    { metric: "p95", value: `${s.p95} ms` },
    { metric: "max", value: `${s.max} ms` },
    { metric: "clicks recorded", value: counted?.click_count ?? 0 },
    {
      metric: "clicks lost",
      value: served - (counted?.click_count ?? 0),
    },
    {
      metric: "responses",
      value: [...codes].map(([c, n]) => `${c}×${n}`).join("  "),
    },
  ]);
}

// ─── 4. Do the admin pages survive the size ─────────────────────────────────

async function sizeCheck() {
  console.log(`\n─── 4. Admin pages with ${N} ambassadors in the table`);

  const pages = [
    "/admin",
    "/admin/analytics",
    "/admin/analytics?cat=ambassadors",
    "/admin/analytics?cat=ambassadors&by=college",
    "/admin/ambassadors",
    "/admin/ambassadors?group=college",
    "/admin/stipend",
    "/admin/leaderboard",
  ];

  const rows: Record<string, string | number>[] = [];
  for (const path of pages) {
    // Signed out, so this times the middleware and the redirect decision, not
    // the query. The query timings come from the server logs; what this
    // catches is a page that has stopped responding at all.
    const started = performance.now();
    const res = await fetch(base + path, { redirect: "manual" });
    await res.arrayBuffer().catch(() => undefined);
    rows.push({
      page: path,
      status: res.status,
      ms: Math.round(performance.now() - started),
    });
  }
  table(rows);
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log("\n─── Cleanup");

  const doomed: string[] = [];
  let page = 1;
  // listUsers pages at 1000 max; loop until a short page comes back.
  for (;;) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email?.endsWith(`@${EMAIL_DOMAIN}`)) doomed.push(u.id);
    }
    if (users.length < 1000) break;
    page += 1;
  }

  await pool(
    doomed.map((id) => async () => {
      await db.auth.admin.deleteUser(id);
    }),
    25,
  );

  await db.from("surveys").delete().eq("title", "Stress test survey");

  const { count: left } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true });

  console.log(`deleted ${doomed.length} test accounts · ${left} profiles left`);
}

// ─── Run ────────────────────────────────────────────────────────────────────

if (cleanupOnly) {
  await cleanup();
} else {
  console.log(`target ${base} · n=${N} · phases ${only.join(", ")}\n`);

  let ids: string[] = [];
  if (only.includes("signup")) ids = await signupStorm();
  if (only.includes("crowd")) {
    await crowd(["/login", "/forgot-password", "/stats"], "the public pages");
  }
  if (only.includes("click") && ids[0]) await clickStorm(ids[0]);
  if (only.includes("size")) await sizeCheck();

  // `--keep` leaves the seeded cohort in place so the admin pages can be
  // measured against it from a signed-in browser, which is the only way to
  // time the real queries — signed out, every admin URL is a redirect and
  // the timing is of the proxy. Run again with `--cleanup` when done.
  if (args.includes("--keep")) {
    console.log("\n--keep: seeded accounts left in place. Remove them with:");
    console.log("  npx tsx scripts/stress-1000.mts --cleanup");
  } else {
    await cleanup();
  }
}
