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
  /** Surveys they collected anything on. */
  surveys: number;
  /** The ones that cleared the response floor — what the target counts. */
  qualifyingSurveys: number;
  met: boolean;
  bonusInr: number;
  totalInr: number;
  paidStatus: string;
};

export type ProgrammeTermsView = {
  downloads: number;
  surveys: number;
  responsesPerSurvey: number;
  amountInr: number;
  bonusPerDownloads: number;
  bonusInr: number;
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

function label(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export const getStipendProgress = cache(async (): Promise<StipendProgress> => {
  const supabase = await createClient();

  const [{ data }, thresholds, { count: activeDays }] = await Promise.all([
    supabase.rpc("my_stipend_progress", { months_back: 6 }),
    getSettings(
      "stipend_min_downloads",
      "stipend_min_surveys",
      "stipend_min_responses_per_survey",
      "stipend_amount_inr",
      "stipend_bonus_per_downloads",
      "stipend_bonus_inr",
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

  const months: StipendMonth[] = (data ?? []).map((row) => ({
    period: row.period,
    label: label(row.period),
    downloads: Number(row.downloads),
    surveys: Number(row.surveys),
    qualifyingSurveys: Number(row.qualifying_surveys),
    met: row.met,
    bonusInr: Number(row.bonus_inr),
    totalInr: Number(row.total_inr),
    paidStatus: row.paid_status,
  }));

  return {
    thresholds: {
      downloads: thresholds.stipend_min_downloads,
      surveys: thresholds.stipend_min_surveys,
      responsesPerSurvey: thresholds.stipend_min_responses_per_survey,
      amountInr: thresholds.stipend_amount_inr,
      bonusPerDownloads: thresholds.stipend_bonus_per_downloads,
      bonusInr: thresholds.stipend_bonus_inr,
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
