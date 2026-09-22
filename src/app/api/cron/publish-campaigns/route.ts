import { NextResponse } from "next/server";

import { sweepScheduledCampaigns } from "@/lib/campaigns/auto-publish";

/**
 * Publishes drafts whose scheduled time has passed, on a schedule of its own.
 *
 * The backstop, not the mechanism. The read paths sweep too — see
 * `publishScheduledCampaigns` — and they are what gives a 9am launch its 9am,
 * because between the admin list and the student dashboard somebody is
 * almost always looking. This covers the case where nobody is: a campaign
 * scheduled for 3am goes live at 3am rather than waiting for the first person
 * to open the app.
 *
 * Guarded by `CRON_SECRET` when one is set, the same way the deadline sweep
 * is. Vercel sends it as `Authorization: Bearer <secret>`.
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

  try {
    const published = await sweepScheduledCampaigns();
    return NextResponse.json({ ok: true, published });
  } catch (err) {
    console.error("cron.publish-campaigns", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
