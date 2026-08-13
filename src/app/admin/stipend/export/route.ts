import { getStipendPeriod, monthStart, recentMonths } from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

function csvCell(value: string | number | boolean | null): string {
  const raw = value === null ? "" : String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
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
    "Approved tasks",
    "Total tasks",
    "Completion %",
    "Completion required %",
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
        r.approvedTasks,
        r.totalTasks,
        r.completionPct,
        period.thresholds.completionPct,
        r.met ? "Eligible" : r.at_risk ? "At risk" : "Not met",
        r.paid ? "Yes" : "No",
        r.met ? period.thresholds.amountInr : 0,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];

  const body = `\uFEFF${lines.join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="stipend-eligibility-${month}.csv"`,
      "cache-control": "no-store",
    },
  });
}
