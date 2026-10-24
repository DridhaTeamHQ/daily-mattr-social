import { NextResponse } from "next/server";

import { purgeExpiredSuspensions } from "@/lib/admin/suspensions";

/**
 * Permanently deletes ambassadors suspended for 30 days without being
 * reinstated. See `purgeExpiredSuspensions` for what goes.
 *
 * Unlike the other crons this one destroys data, so it refuses to run at all
 * without `CRON_SECRET` rather than staying open when none is configured.
 * Vercel sends the secret as `Authorization: Bearer <secret>`.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const result = await purgeExpiredSuspensions();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("cron.purge-suspended", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
