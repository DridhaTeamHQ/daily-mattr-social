import { NextResponse } from "next/server";

import { applyReferralCount } from "@/lib/admin/referral-count";
import { readAll } from "@/lib/admin/read-all";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveVersion } from "@/lib/programme-version";
import { normalizeCode } from "@/lib/referral-code-shape";

/**
 * The Google Sheet's "Total" column, pushed in by the sheet's Apps Script.
 *
 * Total is this run's installs (Installs now − the last run's figure), so each
 * row sets the ambassador's count for the active version — the same thing an
 * admin typing the number on the Installs page does, through the same code.
 *
 * Body: `{ rows: [{ code: "DMA13", total: 3 }, ...] }` — one row when a cell is
 * edited, every row for a full resync. Suspended ambassadors are skipped, and
 * rows already at the right number are left alone so a full resync writes
 * nothing it doesn't have to.
 *
 * Refuses everything without `SHEET_SYNC_SECRET`, sent as
 * `Authorization: Bearer <secret>`. This route moves points; it is never open.
 */
export const dynamic = "force-dynamic";

type Row = { code?: unknown; total?: unknown };

export async function POST(request: Request) {
  const secret = process.env.SHEET_SYNC_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let rows: Row[];
  try {
    const body = await request.json();
    rows = Array.isArray(body?.rows) ? body.rows : [];
  } catch {
    return NextResponse.json({ ok: false, message: "Send JSON." }, { status: 400 });
  }
  if (!rows.length || rows.length > 2000) {
    return NextResponse.json({ ok: false, message: "Send 1–2000 rows." }, { status: 400 });
  }

  try {
    const db = createAdminClient();
    const version = await getActiveVersion();

    const { data: profiles, error } = await db
      .from("profiles")
      .select("id, referral_code, status")
      .not("referral_code", "is", null);
    if (error) throw error;
    const byCode = new Map(profiles.map((p) => [normalizeCode(p.referral_code), p]));

    // This run's counted installs, so unchanged rows can be skipped up front.
    // Paged, because a plain select stops at 1000 rows.
    const counted = await readAll(
      (from, to) =>
        db
          .from("referral_conversions")
          .select("id, ambassador_id")
          .eq("status", "counted")
          .eq("version", version)
          .order("id")
          .range(from, to),
      "sheet-sync",
    );
    const current = new Map<string, number>();
    for (const c of counted) current.set(c.ambassador_id, (current.get(c.ambassador_id) ?? 0) + 1);

    const updated: { code: string; from: number; to: number }[] = [];
    const failed: { code: string; message: string }[] = [];
    const unknown: string[] = [];
    const suspended: string[] = [];
    let unchanged = 0;

    for (const row of rows) {
      const code = normalizeCode(String(row.code ?? ""));
      const total = Number(row.total);
      if (!code) continue;
      if (!Number.isInteger(total) || total < 0) {
        failed.push({ code, message: `Total "${row.total}" is not a whole number` });
        continue;
      }

      const profile = byCode.get(code);
      if (!profile) {
        unknown.push(code);
        continue;
      }
      if (profile.status === "suspended") {
        suspended.push(code);
        continue;
      }

      const from = current.get(profile.id) ?? 0;
      if (from === total) {
        unchanged += 1;
        continue;
      }

      const result = await applyReferralCount(profile.id, total, null, "sheet");
      if (result.ok) updated.push({ code, from, to: total });
      else failed.push({ code, message: result.message });
    }

    return NextResponse.json({ ok: true, version, updated, unchanged, unknown, suspended, failed });
  } catch (err) {
    console.error("sheet-sync", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
