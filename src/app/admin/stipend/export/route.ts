import { csvResponse } from "@/lib/admin/csv-export";
import { getStipendPeriod, monthStart, recentMonths } from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const requested = url.searchParams.get("month");
  const months = recentMonths(12);
  const month =
    requested && months.includes(requested) ? requested : monthStart(new Date());

  const period = await getStipendPeriod(month, true);

  const header = [
    "Name",
    "City",
    "Batch",
    "Approved tasks",
    "Total tasks",
    "Completion %",
    "Status",
    "Already batched",
    "Stipend (INR)",
  ];

  const rows = period.rows.map((r) => [
    r.full_name,
    r.city ?? "",
    r.batch ?? "",
    r.approvedTasks,
    r.totalTasks,
    r.completionPct,
    r.met ? "Eligible" : r.at_risk ? "At risk" : "Not met",
    r.paid ? "Yes" : "No",
    r.met ? period.thresholds.amountInr : 0,
  ]);

  return csvResponse(`stipend-eligibility-${month}.csv`, header, rows);
}
