import { getStipendPeriod, monthStart, recentMonths } from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/queries";

/**
 * The Stipend Eligibility Report from section 8, as a CSV.
 *
 * Every ambassador is included, not just the eligible ones. A report that only
 * lists who passed cannot be used to chase anyone, and "who was one download
 * short" is the column finance and the programme lead both actually read.
 */

export const dynamic = "force-dynamic";

/**
 * Excel treats a leading =, +, - or @ as a formula, so a name like "-Ravi"
 * becomes executable when the file is opened. Prefixing with an apostrophe is
 * the standard defence and is invisible in the cell.
 */
function csvCell(value: string | number | boolean | null): string {
  const raw = value === null ? "" : String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  // The page guard is not enough on its own: this is a separate URL that can be
  // requested directly, and it returns every ambassador's performance.
  await requireAdmin();

  const url = new URL(request.url);
  const requested = url.searchParams.get("month");
  const months = recentMonths(12);
  const month =
    requested && months.includes(requested) ? requested : monthStart(new Date());

  const period = await getStipendPeriod(month);

  const header = [
    "Name",
    "City",
    "Batch",
    "Downloads",
    "Downloads required",
    "Surveys",
    "Surveys required",
    "Status",
    "Already batched",
    "Stipend (INR)",
  ];

  const lines = [
    header.map(csvCell).join(","),
    ...period.rows.map((r) =>
      [
        r.full_name,
        r.city ?? "",
        r.batch ?? "",
        r.downloads,
        period.thresholds.downloads,
        r.surveys,
        period.thresholds.surveys,
        r.met ? "Eligible" : r.at_risk ? "At risk" : "Not met",
        r.paid ? "Yes" : "No",
        r.met ? period.thresholds.amountInr : 0,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];

  // The BOM makes Excel open UTF-8 correctly; without it Indian names with
  // non-ASCII characters arrive mangled.
  const body = `﻿${lines.join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="stipend-eligibility-${month}.csv"`,
      "cache-control": "no-store",
    },
  });
}
