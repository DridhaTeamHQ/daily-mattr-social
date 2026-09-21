import "server-only";

import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateAdminCache } from "@/lib/cache/admin-generation";

/**
 * How often a page load is allowed to sweep, per server instance.
 *
 * The sweep is one indexed UPDATE, but it is on the path of every dashboard
 * and every admin task list — running it on all of them would be a write per
 * page view to close a campaign that closes once. A minute is far below the
 * resolution anybody reads a deadline at.
 */
const EVERY_MS = 60_000;

let lastSweep = 0;

/**
 * Ends every live campaign whose deadline has passed.
 *
 * The deadline already refused new uploads — both submission actions check it
 * — but the campaign itself stayed `live` until an admin pressed End, so the
 * admin list, the tab counts and the overview all kept counting a campaign
 * nobody could work on. This is that button, pressed by the clock.
 *
 * Deliberately the same state change and nothing more: no notification, no
 * archiving. `ended` is where the manual button leaves it too, so a campaign
 * that ends by itself and one an admin ended are the same afterwards.
 *
 * Safe to call from anywhere on a read path — it throttles itself, it is
 * idempotent, and it never throws: a campaign staying live for another minute
 * is not a reason to fail the page that noticed.
 */
export async function closeExpiredCampaigns(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < EVERY_MS) return;
  lastSweep = now;

  try {
    await sweep();
  } catch {
    // Swallowed on purpose — see above. The next caller tries again.
    lastSweep = 0;
  }
}

/**
 * The same sweep, queued to run once the response has been sent.
 *
 * The student dashboard does not need the sweep to have finished before it
 * renders — it reads deadlines off `ends_at`/`ended_at`, and both submission
 * actions check the deadline themselves, so an expired campaign cannot be
 * worked on whatever its status column currently says. All the `await` bought
 * was a badge, at the price of an UPDATE and a round trip on the critical path
 * of every dashboard render.
 *
 * Not a loss of freshness either, on balance. The throttle above already let a
 * finished campaign read as live for up to a minute; deferring narrows that to
 * a single render, because the sweep now runs immediately after the response
 * that noticed rather than being skipped by the next caller inside the window.
 *
 * The admin campaign list deliberately does *not* use this — see the comment
 * at its call site. That page draws the status column, so for it the sweep is
 * part of the read.
 */
export function closeExpiredCampaignsAfterResponse(): void {
  try {
    after(closeExpiredCampaigns);
  } catch {
    // `after()` throws outside a request scope. Nothing is lost: the cron
    // sweeps on its own schedule, and the next render that *is* inside one
    // queues this again.
  }
}

/** The sweep itself, for the cron route, which wants the count and no throttle. */
export async function sweepExpiredCampaigns(): Promise<number> {
  return sweep();
}

async function sweep(): Promise<number> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("campaigns")
    .update({ status: "ended" })
    .eq("status", "live")
    // `not.is.null` matters: a campaign with no deadline never ends on its own.
    .not("ends_at", "is", null)
    .lt("ends_at", new Date().toISOString())
    .select("id");
  if (error) throw error;

  if (data?.length) await invalidateAdminCache();

  return data?.length ?? 0;
}
