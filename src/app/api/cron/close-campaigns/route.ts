import { NextResponse } from "next/server";

import { sweepExpiredCampaigns } from "@/lib/campaigns/auto-end";

/**
 * Ends campaigns whose deadline has passed, on a schedule.
 *
 * The page loads do this too — see `closeExpiredCampaigns` — and between them
 * they cover every case that matters: a campaign that expires while someone is
 * looking ends within the minute, and one that expires overnight is ended by
 * this before the first person opens their dashboard.
 *
 * Guarded by `CRON_SECRET` when one is set. Vercel sends it as
 * `Authorization: Bearer <secret>` on its own cron requests; with no secret
 * configured the route stays open, because all it can do is press a button the
 * clock has already earned.
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
    const ended = await sweepExpiredCampaigns();
    return NextResponse.json({ ok: true, ended });
  } catch (err) {
    console.error("cron.close-campaigns", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
