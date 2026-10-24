import { getReferralSummary, requireAdmin } from "@/lib/admin/queries";
import {
  applyReferralFilters,
  batchOf,
  readReferralFilters,
} from "@/lib/admin/referral-rows";
import { xlsxResponse } from "@/lib/admin/xlsx";

/**
 * The Installs table as an Excel workbook.
 *
 * Takes the same search, batch, status and sort as the page, through the same
 * helper, so what downloads is exactly the table the admin was looking at —
 * narrowed to Batch A, it is Batch A.
 */

export const dynamic = "force-dynamic";

/** `2026-08-26`, in IST, matching every other day boundary in the app. */
function istDay(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

export async function GET(request: Request) {
  // Its own guard: this URL can be typed straight into a browser and it
  // returns every ambassador's email.
  await requireAdmin();

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const filters = readReferralFilters(params);

  const summary = await getReferralSummary();
  const rows = applyReferralFilters(summary.rows, filters);

  // The table's own columns, headed the way the page heads them. College
  // stays on the page.
  const header = [
    "Name",
    "Email",
    "Batch",
    "Referral code",
    "Downloads",
    "Last one",
    "Status",
  ];
  const body = rows.map((r) => [
    r.full_name,
    r.email,
    batchOf(r),
    r.referral_code,
    r.confirmed,
    r.lastConversion ? istDay(r.lastConversion) : "",
    r.status,
  ]);

  const scope = filters.batch
    ? `-${filters.batch.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
    : "";
  return xlsxResponse(
    `installs${scope}-${istDay(new Date())}.xlsx`,
    "Installs",
    header,
    body,
  );
}
