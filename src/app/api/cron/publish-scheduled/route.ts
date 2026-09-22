import { NextResponse } from "next/server";

import { sweepScheduledCampaigns } from "@/lib/campaigns/auto-publish";
import { sweepScheduledSurveys } from "@/lib/surveys/auto-publish";

/**
 * Publishes campaigns and surveys whose scheduled time has passed.
 *
 * Both in one route, rather than one each. They are the same job at the same
 * moment — an admin who schedules a reel campaign and the survey that follows
 * it for the same morning wants one thing to have happened, not two things
 * that might half-happen — and a cron entry is a scarce resource on Vercel's
 * smaller plans. Keeping them together also keeps this project at two.
 *
 * The backstop, not the mechanism. The read paths sweep too — see
 * `publishScheduledCampaigns` and `publishScheduledSurveys` — and they are
 * what gives a 9am launch its 9am, because between the admin console and the
 * student dashboard somebody is almost always looking. This covers the case
 * where nobody is: a launch scheduled for 3am happens at 3am rather than
 * waiting for the first person to open the app.
 *
 * One sweep failing must not cost the other its run, so they are reported
 * separately and a failure is named rather than collapsing the whole route
 * into a 500 that says nothing about which half worked.
 *
 * Guarded by `CRON_SECRET` when one is set, the same way the deadline sweep
 * is. Vercel sends it as `Authorization: Bearer <secret>`. With no secret the
 * route stays open, which is safe here for the same reason it is there: all
 * it can do is press a button the clock has already earned, and the
 * `status = 'draft'` guard means pressing it twice does nothing the first
 * press did not.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const sent = request.headers.get("authorization");
    if (sent !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  // Settled, not `all`: a survey sweep that throws must still leave the
  // campaign sweep's work done and reported.
  const [campaigns, surveys] = await Promise.allSettled([
    sweepScheduledCampaigns(),
    sweepScheduledSurveys(),
  ]);

  if (campaigns.status === "rejected") {
    console.error("cron.publish-scheduled.campaigns", campaigns.reason);
  }
  if (surveys.status === "rejected") {
    console.error("cron.publish-scheduled.surveys", surveys.reason);
  }

  const failed =
    campaigns.status === "rejected" || surveys.status === "rejected";

  return NextResponse.json(
    {
      ok: !failed,
      campaigns: campaigns.status === "fulfilled" ? campaigns.value : null,
      surveys: surveys.status === "fulfilled" ? surveys.value : null,
    },
    { status: failed ? 500 : 200 },
  );
}
