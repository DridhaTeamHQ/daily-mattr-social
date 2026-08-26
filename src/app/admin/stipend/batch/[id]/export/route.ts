import { csvResponse } from "@/lib/admin/csv-export";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/queries";

/**
 * A payout batch as a CSV for the finance upload.
 *
 * Column names follow what RazorpayX and Cashfree bulk-payout sheets expect,
 * so the file can go up without being retyped. Anything already paid is still
 * included with its UTR — finance reconciles against the whole batch, and a
 * file that silently drops rows is worse than one with an extra column.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Its own guard: this URL can be requested directly and carries names,
  // emails and amounts.
  await requireAdmin();

  const { id } = await params;
  const db = createAdminClient();

  const { data: batch } = await db
    .from("payout_batches")
    .select(
      "id, label, kind, period_month, status, payouts(amount_inr, status, utr, redemption_id, profiles(full_name, email, phone, referral_code))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!batch) return new Response("Not found", { status: 404 });

  const rows = (batch.payouts ?? []) as unknown as Array<{
    amount_inr: number;
    status: string;
    utr: string | null;
    redemption_id: string | null;
    profiles: {
      full_name: string;
      email: string;
      phone: string | null;
      referral_code: string;
    } | null;
  }>;

  const header = [
    "Name",
    "Email",
    "Phone",
    "Referral code",
    "Amount (INR)",
    "Type",
    "Status",
    "UTR",
  ];

  const lines = rows.map((r) => [
    r.profiles?.full_name ?? "",
    r.profiles?.email ?? "",
    r.profiles?.phone ?? "",
    r.profiles?.referral_code ?? "",
    Number(r.amount_inr).toFixed(2),
    r.redemption_id ? "Redemption" : "Stipend",
    r.status,
    r.utr ?? "",
  ]);

  const slug = batch.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return csvResponse(`${slug || "payout-batch"}.csv`, header, lines);
}
