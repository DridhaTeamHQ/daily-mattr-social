import "server-only";

import { cache } from "react";

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
  downloads: number;
  surveys: number;
  met: boolean;
  paidStatus: string;
};

export type StipendProgress = {
  thresholds: { downloads: number; surveys: number; amountInr: number };
  current: StipendMonth | null;
  history: StipendMonth[];
};

function label(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export const getStipendProgress = cache(async (): Promise<StipendProgress> => {
  const supabase = await createClient();

  const [{ data }, thresholds] = await Promise.all([
    supabase.rpc("my_stipend_progress", { months_back: 6 }),
    getSettings(
      "stipend_min_downloads",
      "stipend_min_surveys",
      "stipend_amount_inr",
    ),
  ]);

  const months: StipendMonth[] = (data ?? []).map((row) => ({
    period: row.period,
    label: label(row.period),
    downloads: Number(row.downloads),
    surveys: Number(row.surveys),
    met: row.met,
    paidStatus: row.paid_status,
  }));

  return {
    thresholds: {
      downloads: thresholds.stipend_min_downloads,
      surveys: thresholds.stipend_min_surveys,
      amountInr: thresholds.stipend_amount_inr,
    },
    // The RPC returns newest first, so the current month is simply the head.
    current: months[0] ?? null,
    history: months.slice(1),
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
