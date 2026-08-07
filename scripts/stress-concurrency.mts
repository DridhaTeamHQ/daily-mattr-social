/**
 * Concurrency integrity tests — the races that lose data or double-pay.
 *
 *   1. click storm  — N concurrent bump_survey_click on ONE link. The counter
 *                     must equal N exactly (atomic add, no lost updates).
 *   2. double-approve — the SAME approval credit inserted M times at once for
 *                     one submission. Exactly ONE must land (the partial unique
 *                     index on (source_type, source_id, direction)).
 *
 * Uses the service-role client and the existing STRESS scaffold. Read-modify
 * of one stress link's counter and one stress submission's ledger; both are
 * cleaned by stress-teardown.sql.
 *
 *   npx tsx scripts/stress-concurrency.mts [--clicks 5000] [--pool 120]
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const flag = (n: string, d: number) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const CLICKS = flag("clicks", 5000);
const POOL = flag("pool", 120);

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function pool<T>(jobs: (() => Promise<T>)[], limit: number) {
  let next = 0;
  const out: T[] = new Array(jobs.length);
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

// ─── 1. Click storm ─────────────────────────────────────────────────────────
async function clickStorm() {
  console.log(`\n─── 1. Click storm: ${CLICKS} concurrent bumps on one link`);

  const { data: link } = await db
    .from("survey_links")
    .select("id, slug")
    .like("slug", "stress-%")
    .limit(1)
    .single();
  if (!link) return console.log("no stress link found — run the scaffold first");

  await db.from("survey_links").update({ click_count: 0 }).eq("id", link.id);

  let errors = 0;
  const started = performance.now();
  await pool(
    Array.from({ length: CLICKS }, () => async () => {
      const { error } = await db.rpc("bump_survey_click", {
        link_id: link.id,
        amount: 1,
      });
      if (error) errors++;
    }),
    POOL,
  );
  const elapsed = (performance.now() - started) / 1000;

  const { data: after } = await db
    .from("survey_links")
    .select("click_count")
    .eq("id", link.id)
    .single();

  const recorded = after?.click_count ?? 0;
  console.table([
    { metric: "clicks fired", value: CLICKS },
    { metric: "rpc errors", value: errors },
    { metric: "recorded", value: recorded },
    { metric: "lost", value: CLICKS - errors - recorded },
    { metric: "exact?", value: recorded === CLICKS - errors ? "YES ✓" : "NO ✗ lost updates" },
    { metric: "throughput", value: `${Math.round(CLICKS / elapsed)} rpc/s` },
  ]);

  await db.from("survey_links").update({ click_count: 0 }).eq("id", link.id);
}

// ─── 2. Double-approve race ─────────────────────────────────────────────────
async function doubleApprove() {
  console.log(`\n─── 2. Double-approve: 100 concurrent identical credits, one submission`);

  const { data: sub } = await db
    .from("submissions")
    .select("id, ambassador_id")
    .eq("review_note", "STRESS")
    .eq("status", "approved")
    .limit(1)
    .single();
  if (!sub) return console.log("no approved stress submission — run the flow seed first");

  // A source_id nothing else uses, so this test is self-contained and the
  // teardown's STRESS|race note removes it.
  const raceSource = `race-${sub.id}`;

  let ok = 0;
  let dupeRejected = 0;
  let otherErr = 0;
  await pool(
    Array.from({ length: 100 }, () => async () => {
      const { error } = await db.from("point_ledger").insert({
        ambassador_id: sub.ambassador_id,
        delta: 10,
        reason: "instagram_task",
        source_type: "submission",
        source_id: raceSource,
        note: "STRESS|race",
      });
      if (!error) ok++;
      else if (error.message.includes("duplicate")) dupeRejected++;
      else otherErr++;
    }),
    100,
  );

  const { count } = await db
    .from("point_ledger")
    .select("id", { count: "exact", head: true })
    .eq("source_id", raceSource);

  console.table([
    { metric: "insert attempts", value: 100 },
    { metric: "landed", value: ok },
    { metric: "rejected as duplicate", value: dupeRejected },
    { metric: "other errors", value: otherErr },
    { metric: "rows actually in ledger", value: count ?? 0 },
    { metric: "paid once only?", value: count === 1 ? "YES ✓" : `NO ✗ (${count})` },
  ]);
}

await clickStorm();
await doubleApprove();
console.log("\nCleanup of the race rows is in stress-teardown.sql (note like 'STRESS|%').");
