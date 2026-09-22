import "server-only";

import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateAdminCache } from "@/lib/cache/admin-generation";
import { activeAmbassadorIds, notifyMany } from "@/lib/notifications";

/**
 * Launching a campaign by the clock rather than by hand.
 *
 * The mirror of `auto-end`: that file is the End button pressed by the clock,
 * this one is Publish. An admin schedules a draft for 9am and stops having to
 * be awake at 9am — see migration 0051 for why the time lives in its own
 * column and not in `starts_at`.
 *
 * The one real difference from ending, and the reason this is not two lines in
 * that file: publishing is loud. Going live notifies every active ambassador,
 * exactly as the button does, because a campaign nobody was told about is not
 * published in any sense that matters to the cohort. Ending is silent.
 */

/**
 * How often a read path is allowed to sweep, per server instance.
 *
 * Same minute as the deadline sweep, for the same reason: the query is one
 * indexed UPDATE, but it sits on pages that render constantly, and a minute is
 * finer than anybody schedules a launch to.
 */
const EVERY_MS = 60_000;

let lastSweep = 0;

type Launched = { id: string; title: string };

/**
 * Publishes every draft whose scheduled time has passed.
 *
 * Unlike the deadline sweep this is meant to be *awaited* on a read path, not
 * deferred. Ending a campaign only changes a badge — the deadline itself is
 * enforced elsewhere, so a campaign reading as live for one more render is
 * harmless. Publishing changes which rows exist for the reader at all: defer
 * it and a student refreshing at 9:00 is told there is nothing to do, and the
 * campaign appears only because they happened to refresh again.
 *
 * The flip is awaited; the notifications are not. Announcing to the whole
 * cohort is a fan-out of push sends, and no render should wait on it.
 *
 * Safe to call from any read path — throttled, idempotent, and it never
 * throws: a campaign launching a minute late is not a reason to fail the page
 * that noticed.
 */
export async function publishScheduledCampaigns(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < EVERY_MS) return;
  lastSweep = now;

  try {
    const launched = await sweep();
    if (launched.length === 0) return;

    await invalidateAdminCache();

    try {
      after(() => announce(launched));
    } catch {
      // `after()` throws outside a request scope. Send them inline rather
      // than dropping them — the campaigns are live either way, and a live
      // campaign nobody was told about is the one failure worth waiting on.
      await announce(launched);
    }
  } catch {
    // Swallowed on purpose — see above. Reopening the window so the next
    // caller retries rather than waiting out a minute that did nothing.
    lastSweep = 0;
  }
}

/** The same sweep, for the cron route: no throttle, and it waits to be told. */
export async function sweepScheduledCampaigns(): Promise<number> {
  const launched = await sweep();
  if (launched.length === 0) return 0;

  await invalidateAdminCache();
  await announce(launched);

  return launched.length;
}

async function sweep(): Promise<Launched[]> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("campaigns")
    .update({
      status: "live",
      // The schedule has been kept, so it stops being a pending one. Leaving
      // it set would have the admin list saying "Publishes Friday 9am" under
      // a campaign that is already live. When it actually launched is stamped
      // on `published_at` by trigger, which is the durable record.
      publish_at: null,
    })
    // Both halves matter. The status guard is what makes this idempotent —
    // two instances sweeping the same second cannot both claim the row — and
    // `not.is.null` keeps every unscheduled draft out of it.
    .eq("status", "draft")
    .not("publish_at", "is", null)
    .lte("publish_at", new Date().toISOString())
    .select("id, title");
  if (error) throw error;

  return data ?? [];
}

/**
 * Tells the cohort, in the same words the button uses.
 *
 * One `notifyMany` per campaign rather than one for the batch: two campaigns
 * scheduled for the same morning are two pieces of news, and a merged
 * notification could only name one of them or neither.
 */
async function announce(launched: Launched[]): Promise<void> {
  const audience = await activeAmbassadorIds();
  if (audience.length === 0) return;

  for (const campaign of launched) {
    await notifyMany(audience, {
      type: "campaign_live",
      title: "New campaign is live",
      body: campaign.title,
      href: "/dashboard/campaigns",
      meta: { campaignId: campaign.id },
    });
  }
}
