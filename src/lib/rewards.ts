import "server-only";

import { cache } from "react";

import { isDemoMode } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import type { Tables } from "@/lib/database.types";

/**
 * The student's own view of stipend progress and points-for-cash.
 *
 * Everything reads through the *user's* client rather than the service-role
 * one, so RLS still applies. But RLS alone is NOT enough here, and every query
 * below also filters by id explicitly.
 *
 * The reason is that these tables carry a second policy for admins —
 * `point_ledger_select_admin` and friends — which grants SELECT over every
 * row. An admin opening the ambassador dashboard therefore summed the entire
 * programme and saw a balance of 3,157 points that belonged to nobody. The
 * filter is what makes "my balance" mean one person's balance regardless of
 * who is asking.
 */

export type StipendMonth = {
  period: string;
  label: string;
  totalTasks: number;
  approvedTasks: number;
  completionPct: number;
  met: boolean;
  totalInr: number;
  paidStatus: string;
};

export type ProgrammeTermsView = {
  completionPct: number;
  amountInr: number;
  activeDays: number;
  activityWindow: number;
};

export type StipendProgress = {
  thresholds: ProgrammeTermsView;
  current: StipendMonth | null;
  history: StipendMonth[];
  /** Days on the app inside the activity window. Their own count only. */
  activeDays: number;
};

/**
 * The first day of the activity window, in IST.
 *
 * Same boundary the database uses. Computing it here rather than in SQL keeps
 * this a plain PostgREST filter instead of another function to grant.
 */
function windowStart(days = 10): string {
  const now = new Date(Date.now() - (days - 1) * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    now,
  );
}

/**
 * A count from the database, or zero.
 *
 * `Number(undefined)` is NaN, and a NaN reaching `formatNumber` prints the word
 * on the page — which is what a column the RPC no longer returns looked like
 * when the function in the database was a version behind the code. A missing
 * number is zero here, and the error above says why.
 */
function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function label(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

const DEMO_STIPEND_PROGRESS: StipendProgress = {
  thresholds: {
    completionPct: 80,
    amountInr: 3000,
    activeDays: 8,
    activityWindow: 10,
  },
  current: {
    period: "2026-08-01",
    label: "August 2026",
    totalTasks: 10,
    approvedTasks: 8,
    completionPct: 80,
    met: true,
    totalInr: 3000,
    paidStatus: "none",
  },
  history: [
    {
      period: "2026-07-01",
      label: "July 2026",
      totalTasks: 9,
      approvedTasks: 7,
      completionPct: 78,
      met: false,
      totalInr: 0,
      paidStatus: "none",
    },
    {
      period: "2026-06-01",
      label: "June 2026",
      totalTasks: 8,
      approvedTasks: 8,
      completionPct: 100,
      met: true,
      totalInr: 3000,
      paidStatus: "paid",
    },
  ],
  activeDays: 6,
};

export const getStipendProgress = cache(async (): Promise<StipendProgress> => {
  if (isDemoMode()) return DEMO_STIPEND_PROGRESS;

  const supabase = await createClient();

  const [{ data, error }, thresholds, { count: activeDays }] = await Promise.all([
    supabase.rpc("my_stipend_progress", { months_back: 6 }),
    getSettings(
      "stipend_min_completion_pct",
      "stipend_amount_inr",
      "activity_min_days",
      "activity_window_days",
    ),
    // Their own attendance. RLS on active_days already limits this to the
    // caller, so there is nothing to scope by hand.
    supabase
      .from("active_days")
      .select("day", { count: "exact", head: true })
      .gte("day", windowStart()),
  ]);

  if (error) console.error("my_stipend_progress failed", error);

  const months: StipendMonth[] = (data ?? []).map((row) => ({
    period: row.period,
    label: label(row.period),
    totalTasks: count(row.total_tasks),
    approvedTasks: count(row.approved_tasks),
    completionPct: count(row.completion_pct),
    met: row.met,
    totalInr: count(row.total_inr),
    paidStatus: row.paid_status,
  }));

  return {
    thresholds: {
      completionPct: thresholds.stipend_min_completion_pct,
      amountInr: thresholds.stipend_amount_inr,
      activeDays: thresholds.activity_min_days,
      activityWindow: thresholds.activity_window_days,
    },
    // The RPC returns newest first, so the current month is simply the head.
    current: months[0] ?? null,
    history: months.slice(1),
    activeDays: activeDays ?? 0,
  };
});

export type RewardsView = {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  pointsPerRupee: number;
  minPoints: number;
  /** What the balance is worth right now, rounded down to whole rupees. */
  redeemableInr: number;
  ledger: Tables<"point_ledger">[];
  requests: Tables<"redemption_requests">[];
  payouts: Tables<"payouts">[];
};

export const getRewards = cache(async (): Promise<RewardsView | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [ledgerRes, requestsRes, payoutsRes, settings] = await Promise.all([
    supabase
      .from("point_ledger")
      .select("*")
      .eq("ambassador_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("redemption_requests")
      .select("*")
      .eq("ambassador_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(50),
    supabase
      .from("payouts")
      .select("*")
      .eq("ambassador_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    getSettings("points_per_rupee", "min_redemption_points"),
  ]);

  const ledger = ledgerRes.data ?? [];

  // Summed from the ledger rather than stored anywhere. A balance column would
  // be a second source of truth that could disagree with its own history.
  const lifetimeEarned = ledger
    .filter((row) => row.delta > 0)
    .reduce((sum, row) => sum + row.delta, 0);
  const lifetimeSpent = ledger
    .filter((row) => row.delta < 0)
    .reduce((sum, row) => sum + Math.abs(row.delta), 0);

  const balance = lifetimeEarned - lifetimeSpent;
  const rate = settings.points_per_rupee || 10;

  return {
    balance,
    lifetimeEarned,
    lifetimeSpent,
    pointsPerRupee: rate,
    minPoints: settings.min_redemption_points,
    redeemableInr: Math.floor(balance / rate),
    ledger,
    requests: requestsRes.data ?? [],
    payouts: payoutsRes.data ?? [],
  };
});
