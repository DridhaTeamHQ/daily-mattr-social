import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import type { Enums, Tables } from "@/lib/database.types";

/**
 * Stipend eligibility, redemptions and payouts — the read side.
 *
 * Eligibility is never stored. It is recomputed from the ledger and the
 * conversions every time it is asked for, because an admin correcting a
 * download count must change who is eligible immediately. A monthly snapshot
 * table would answer "who was eligible when the job last ran", which is a
 * different and much less useful question, and it would go stale silently.
 *
 * Payouts, by contrast, are read straight out of the table. A payment is an
 * event that happened, not a calculation.
 */

/** First day of the month a date falls in, as YYYY-MM-DD. */
export function monthStart(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

/** The last `count` months, newest first, as YYYY-MM-01 strings. */
export function recentMonths(count = 6): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) =>
    monthStart(new Date(now.getFullYear(), now.getMonth() - i, 1)),
  );
}

export type EligibilityRow = {
  ambassador_id: string;
  full_name: string;
  city: string | null;
  batch: string | null;
  downloads: number;
  surveys: number;
  met: boolean;
  at_risk: boolean;
  /** Whether a stipend has already been paid or queued for this month. */
  paid: boolean;
};

export type StipendPeriod = {
  month: string;
  label: string;
  thresholds: { downloads: number; surveys: number; amountInr: number };
  rows: EligibilityRow[];
  totals: {
    eligible: number;
    atRisk: number;
    notMet: number;
    cohort: number;
    projectedCostInr: number;
    alreadyPaidInr: number;
  };
};

export const getStipendPeriod = cache(
  async (month: string): Promise<StipendPeriod> => {
    // The RPC goes through the *user's* client on purpose: it checks is_admin()
    // internally, and calling it as service-role would bypass the one guard the
    // function has.
    const supabase = await createClient();
    const db = createAdminClient();

    const [{ data: rows }, settings, { data: payouts }] = await Promise.all([
      supabase.rpc("stipend_eligibility", { period_start: month }),
      getSettings(
        "stipend_min_downloads",
        "stipend_min_surveys",
        "stipend_amount_inr",
      ),
      db
        .from("payouts")
        .select("ambassador_id, amount_inr, status, payout_batches!inner(period_month)")
        .eq("kind", "stipend")
        .eq("payout_batches.period_month", month),
    ]);

    const paidTo = new Set((payouts ?? []).map((p) => p.ambassador_id));
    const alreadyPaidInr = (payouts ?? [])
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + Number(p.amount_inr), 0);

    const list: EligibilityRow[] = (rows ?? []).map((r) => ({
      ambassador_id: r.ambassador_id,
      full_name: r.full_name,
      city: r.city,
      batch: r.batch,
      downloads: Number(r.downloads),
      surveys: Number(r.surveys),
      met: r.met,
      at_risk: r.at_risk,
      paid: paidTo.has(r.ambassador_id),
    }));

    const eligible = list.filter((r) => r.met);

    return {
      month,
      label: monthLabel(month),
      thresholds: {
        downloads: settings.stipend_min_downloads,
        surveys: settings.stipend_min_surveys,
        amountInr: settings.stipend_amount_inr,
      },
      rows: list,
      totals: {
        eligible: eligible.length,
        atRisk: list.filter((r) => r.at_risk).length,
        notMet: list.filter((r) => !r.met && !r.at_risk).length,
        cohort: list.length,
        // What it would cost to pay everyone who has qualified but hasn't been
        // paid yet — the number finance actually needs to hold.
        projectedCostInr:
          eligible.filter((r) => !r.paid).length * settings.stipend_amount_inr,
        alreadyPaidInr,
      },
    };
  },
);

// ─── Redemptions ────────────────────────────────────────────────────────────

export type RedemptionRow = Tables<"redemption_requests"> & {
  ambassador: { full_name: string; email: string; referral_code: string } | null;
  /** Their balance now, so an admin can see if the request is still coverable. */
  balance: number;
};

export const getRedemptions = cache(async (): Promise<RedemptionRow[]> => {
  const db = createAdminClient();

  const { data } = await db
    .from("redemption_requests")
    .select(
      "id, ambassador_id, points, amount_inr, status, method, payee_ref, note, decided_by, decided_at, decision_note, requested_at, profiles(full_name, email, referral_code)",
    )
    .order("requested_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // One grouped read rather than a balance query per row.
  const ids = [...new Set(rows.map((r) => r.ambassador_id))];
  const { data: ledger } = await db
    .from("point_ledger")
    .select("ambassador_id, delta")
    .in("ambassador_id", ids);

  const balances = new Map<string, number>();
  for (const entry of ledger ?? []) {
    balances.set(
      entry.ambassador_id,
      (balances.get(entry.ambassador_id) ?? 0) + entry.delta,
    );
  }

  return rows.map((r) => {
    const profile = r.profiles as unknown as
      | { full_name: string; email: string; referral_code: string }
      | null;
    return {
      ...(r as unknown as Tables<"redemption_requests">),
      ambassador: profile,
      balance: balances.get(r.ambassador_id) ?? 0,
    };
  });
});

// ─── Payouts ────────────────────────────────────────────────────────────────

export type PayoutRow = Tables<"payouts"> & {
  ambassador: { full_name: string; email: string } | null;
};

export type BatchRow = Tables<"payout_batches"> & {
  payouts: PayoutRow[];
  totals: { count: number; amountInr: number; paid: number; failed: number };
};

export const getPayoutBatches = cache(async (): Promise<BatchRow[]> => {
  const db = createAdminClient();

  const { data } = await db
    .from("payout_batches")
    .select(
      "id, label, kind, period_month, status, created_by, created_at, processed_at, payouts(id, batch_id, ambassador_id, redemption_id, kind, amount_inr, status, utr, failure_reason, processed_at, created_at, profiles(full_name, email))",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((batch) => {
    const rows = ((batch.payouts ?? []) as unknown as Array<
      Tables<"payouts"> & { profiles: { full_name: string; email: string } | null }
    >).map((p) => ({ ...p, ambassador: p.profiles ?? null }));

    return {
      ...(batch as unknown as Tables<"payout_batches">),
      payouts: rows,
      totals: {
        count: rows.length,
        amountInr: rows.reduce((sum, p) => sum + Number(p.amount_inr), 0),
        paid: rows.filter((p) => p.status === "paid").length,
        failed: rows.filter((p) => p.status === "failed").length,
      },
    };
  });
});

/** Programme-wide money figures for the analytics page. */
export type MoneySummary = {
  stipendPaidInr: number;
  redemptionPaidInr: number;
  pendingInr: number;
  redemptionsOpen: number;
  downloads: number;
  costPerDownloadInr: number | null;
};

export const getMoneySummary = cache(async (): Promise<MoneySummary> => {
  const db = createAdminClient();

  const [{ data: payouts }, { data: redemptions }, { count: downloads }] =
    await Promise.all([
      db.from("payouts").select("kind, amount_inr, status"),
      db.from("redemption_requests").select("status"),
      db
        .from("referral_conversions")
        .select("id", { count: "exact", head: true })
        .eq("status", "counted"),
    ]);

  const rows = payouts ?? [];
  const sum = (kind: string, status: Enums<"payout_status">) =>
    rows
      .filter((p) => p.kind === kind && p.status === status)
      .reduce((total, p) => total + Number(p.amount_inr), 0);

  const stipendPaidInr = sum("stipend", "paid");
  const redemptionPaidInr = sum("redemption", "paid");
  const pendingInr = rows
    .filter((p) => p.status === "pending" || p.status === "processing")
    .reduce((total, p) => total + Number(p.amount_inr), 0);

  const totalPaid = stipendPaidInr + redemptionPaidInr;
  const installs = downloads ?? 0;

  return {
    stipendPaidInr,
    redemptionPaidInr,
    pendingInr,
    redemptionsOpen: (redemptions ?? []).filter(
      (r) => r.status === "requested" || r.status === "approved",
    ).length,
    downloads: installs,
    // Guarded rather than shown as zero: "₹0 per download" before the first
    // install reads as free, when the truth is that it is not yet knowable.
    costPerDownloadInr: installs > 0 ? totalPaid / installs : null,
  };
});
