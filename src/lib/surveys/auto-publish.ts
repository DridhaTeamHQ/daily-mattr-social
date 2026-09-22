import "server-only";

import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateAdminCache } from "@/lib/cache/admin-generation";
import { activeAmbassadorIds, notifyMany } from "@/lib/notifications";

/**
 * Launching a survey by the clock rather than by hand.
 *
 * The companion to `campaigns/auto-publish`, and a heavier job than that one.
 * Publishing a campaign is a status change plus a notification. Publishing a
 * survey is a status change, a call to `ensure_survey_links` that mints a
 * personal link for every active ambassador, and *then* the notification —
 * and the order matters, because the notification says "your link is ready"
 * and it has to be true by the time anyone reads it.
 *
 * So this does all three, in that order, exactly as `setSurveyStatus` does.
 * A scheduled launch and a launch somebody pressed leave the same survey.
 */

/**
 * How often a read path is allowed to sweep, per server instance.
 *
 * Same minute as the campaign sweeps. Finer than anybody schedules to, and it
 * keeps a page that renders constantly from issuing links on every render.
 */
const EVERY_MS = 60_000;

let lastSweep = 0;

type Launched = { id: string; title: string; points_per_response: number };

/**
 * Publishes every survey draft whose scheduled time has passed.
 *
 * Awaited on read paths rather than deferred, for the reason the campaign
 * sweep gives and then some: a student's survey page is built from their
 * `survey_links` rows, and those rows do not exist until this has run. Defer
 * it and an ambassador who was told their link is ready opens the page to
 * nothing.
 *
 * The status flip and the links are awaited; only the notification is handed
 * off, because it is a fan-out of push sends and nothing should render behind
 * it.
 *
 * Safe to call from any read path — throttled, idempotent, never throws.
 */
export async function publishScheduledSurveys(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < EVERY_MS) return;
  lastSweep = now;

  try {
    const launched = await sweep();
    if (launched.length === 0) return;

    await issueLinks(launched);
    await invalidateAdminCache();

    try {
      after(() => announce(launched));
    } catch {
      // `after()` throws outside a request scope. Sent inline rather than
      // dropped: the links exist now, and an ambassador who is never told
      // about a link they hold is the one failure worth waiting on.
      await announce(launched);
    }
  } catch {
    // Swallowed on purpose. Reopening the window so the next caller retries
    // rather than waiting out a minute that achieved nothing.
    lastSweep = 0;
  }
}

/** The same sweep, for the cron route: no throttle, and it waits to be told. */
export async function sweepScheduledSurveys(): Promise<number> {
  const launched = await sweep();
  if (launched.length === 0) return 0;

  await issueLinks(launched);
  await invalidateAdminCache();
  await announce(launched);

  return launched.length;
}

async function sweep(): Promise<Launched[]> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("surveys")
    .update({
      status: "live",
      // The schedule has been kept, so it stops being a pending one — see the
      // same decision on campaigns in migration 0051.
      publish_at: null,
    })
    // The status guard is what makes this idempotent: two instances sweeping
    // the same second cannot both claim the row, so nobody gets two links or
    // two notifications.
    .eq("status", "draft")
    .not("publish_at", "is", null)
    .lte("publish_at", new Date().toISOString())
    .select("id, title, points_per_response");
  if (error) throw error;

  return data ?? [];
}

/**
 * Mints the personal links, which is what actually makes a survey usable.
 *
 * Failures are logged and swallowed rather than thrown. The survey is already
 * live at this point — throwing would abandon the sweep with a live survey,
 * no links, and no notification either, which is the worst of the three
 * outcomes. Leaving it live and link-less is recoverable and, better, it is
 * *visible*: the admin list already draws "This survey is live but nobody has
 * a link" with an Issue missing links button next to it.
 */
async function issueLinks(launched: Launched[]): Promise<void> {
  const db = createAdminClient();

  for (const survey of launched) {
    const { error } = await db.rpc("ensure_survey_links", {
      target_survey: survey.id,
    });

    if (error) {
      console.error("surveys.auto-publish.links", survey.id, error.message);
    }
  }
}

/**
 * Tells the cohort, in the same words the button uses.
 *
 * One `notifyMany` per survey rather than one for the batch: two surveys
 * scheduled for the same morning are two links, and a merged notification
 * could only point at one of them.
 */
async function announce(launched: Launched[]): Promise<void> {
  const audience = await activeAmbassadorIds();
  if (audience.length === 0) return;

  for (const survey of launched) {
    await notifyMany(audience, {
      type: "survey_live",
      title: "New survey — your link is ready",
      body: `${survey.title} · ${survey.points_per_response} points per response`,
      href: "/dashboard/surveys",
      meta: { surveyId: survey.id },
    });
  }
}
