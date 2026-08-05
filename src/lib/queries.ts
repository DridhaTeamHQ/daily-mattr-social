import "server-only";

import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/database.types";

/**
 * Read models for the ambassador screens.
 *
 * Every page reads through this module, never through a Supabase client
 * directly. That keeps the demo-mode fallback in one place and means the
 * switch to live data is a change here alone.
 *
 * Everything exported here is wrapped in React's `cache()`. A layout and the
 * page inside it both need the dashboard payload, and without deduping,
 * `getDashboard()` ran twice per navigation — each run being a profile read,
 * four RPCs, the ledger, notifications, and `getCampaigns()` on top. Roughly
 * thirty round trips to a database in ap-south-1 for one page view, which is
 * exactly the lag you feel on a nav click. `cache()` collapses repeat calls
 * within a single render to one.
 */

/**
 * The signed-in user, fetched at most once per request.
 *
 * `auth.getUser()` is a network call to the auth server, not a cookie read,
 * so calling it from every query is the single most expensive habit in here.
 */
const currentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export type TaskCard = {
  id: string;
  type: Enums<"task_type">;
  points: number;
  instructions: string | null;
  required: boolean;
  /** The caller's own submission for this task, if any. */
  submission_status: Enums<"submission_status"> | null;
};

export type CampaignCard = {
  id: string;
  title: string;
  description: string | null;
  instagram_url: string;
  /** Shown in the upload dialog so students know what must be visible. */
  expected_handle: string;
  thumbnail_path: string | null;
  ends_at: string | null;
  tasks: TaskCard[];
};

export type SurveyStat = {
  survey_id: string;
  survey_title: string;
  slug: string;
  click_count: number;
  valid_responses: number;
  flagged: number;
  points_earned: number;
};

export type LedgerEntry = {
  id: number;
  delta: number;
  reason: Enums<"ledger_reason">;
  note: string | null;
  created_at: string;
};

export type LeaderboardRow = {
  position: number;
  ambassador_id: string;
  full_name: string;
  college: string | null;
  points: number;
  is_me: boolean;
};

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export type DashboardData = {
  profile: {
    id: string;
    full_name: string;
    college: string | null;
    referral_code: string;
    role: Enums<"user_role">;
    status: Enums<"user_status">;
    must_change_password: boolean;
  };
  standing: { points: number; position: number; total: number };
  surveys: SurveyStat[];
  campaigns: CampaignCard[];
  referrals: {
    code: string;
    total_confirmed: number;
    points_earned: number;
    last_conversion: string | null;
  };
  recentLedger: LedgerEntry[];
  /** Consecutive days with earnings, for the flame. */
  streak: number;
  notifications: NotificationRow[];
};

/**
 * Whether the signed-in student is still using an admin-issued temporary
 * password. False in demo mode, where there is no account to speak of.
 */
export async function mustChangePassword(): Promise<boolean> {
  if (isDemoMode()) return false;

  // Reads from the cached dashboard payload rather than issuing its own
  // profile query — the flag now travels with the profile it belongs to.
  const data = await getDashboard();
  return data?.profile.must_change_password ?? false;
}

/** True when the screens are showing fixtures rather than real data. */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

export const getDashboard = cache(async (): Promise<DashboardData | null> => {
  if (isDemoMode()) {
    const { demoDashboard } = await import("@/lib/demo-data");
    return demoDashboard;
  }

  const supabase = await createClient();

  const user = await currentUser();
  if (!user) return null;

  const [
    profileRes,
    standingRes,
    surveysRes,
    referralsRes,
    ledgerRes,
    streakRes,
    notificationsRes,
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, college, referral_code, role, status, must_change_password")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.rpc("my_standing"),
      supabase.rpc("my_survey_stats"),
      supabase.rpc("my_referral_stats"),
      supabase
        .from("point_ledger")
        .select("id, delta, reason, note, created_at")
        .eq("ambassador_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.rpc("my_streak"),
      supabase
        .from("notifications")
        .select("id, type, title, body, href, read_at, created_at")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const profile = profileRes.data;
  if (!profile) return null;

  const standing = standingRes.data?.[0] ?? {
    points: 0,
    position: 0,
    total: 0,
  };

  const referral = referralsRes.data?.[0];

  return {
    profile,
    standing,
    surveys: surveysRes.data ?? [],
    campaigns: await getCampaigns(),
    referrals: {
      code: referral?.code ?? profile.referral_code,
      total_confirmed: referral?.total_confirmed ?? 0,
      points_earned: referral?.points_earned ?? 0,
      last_conversion: referral?.last_conversion ?? null,
    },
    recentLedger: ledgerRes.data ?? [],
    streak: streakRes.data ?? 0,
    notifications: notificationsRes.data ?? [],
  };
});

export const getCampaigns = cache(async (): Promise<CampaignCard[]> => {
  if (isDemoMode()) {
    const { demoDashboard } = await import("@/lib/demo-data");
    return demoDashboard.campaigns;
  }

  const supabase = await createClient();

  const user = await currentUser();
  if (!user) return [];

  const { data: campaigns } = await supabase
    .from("campaigns")
    // Must stay a single string literal — postgrest-js infers the row shape
    // from it, and a concatenated expression degrades to `GenericStringError`.
    .select(
      "id, title, description, instagram_url, expected_handle, thumbnail_path, ends_at, campaign_tasks(id, type, points, instructions, required, order_index)",
    )
    .eq("status", "live")
    .order("starts_at", { ascending: false });

  if (!campaigns?.length) return [];

  // RLS already restricts this to the caller's own rows.
  const { data: mine } = await supabase
    .from("submissions")
    .select("campaign_task_id, status, attempt")
    .eq("ambassador_id", user.id)
    .order("attempt", { ascending: false });

  // Highest attempt wins — that's the one the student is looking at.
  const latest = new Map<string, Enums<"submission_status">>();
  for (const row of mine ?? []) {
    if (!latest.has(row.campaign_task_id)) {
      latest.set(row.campaign_task_id, row.status);
    }
  }

  return campaigns.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    instagram_url: c.instagram_url,
    expected_handle: c.expected_handle,
    thumbnail_path: c.thumbnail_path,
    ends_at: c.ends_at,
    tasks: [...(c.campaign_tasks ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map((t) => ({
        id: t.id,
        type: t.type,
        points: t.points,
        instructions: t.instructions,
        required: t.required,
        submission_status: latest.get(t.id) ?? null,
      })),
  }));
});

export const getLeaderboard = cache(async (
  limit = 100,
): Promise<LeaderboardRow[]> => {
  if (isDemoMode()) {
    const { demoLeaderboard } = await import("@/lib/demo-data");
    return demoLeaderboard;
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("leaderboard", { limit_count: limit });
  return data ?? [];
});

// ─── Windowed leaderboard ───────────────────────────────────────────────────

export type LeaderWindow = "day" | "week" | "month" | "all";

export const LEADER_WINDOWS: { key: LeaderWindow; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

export function isLeaderWindow(value: string | undefined): value is LeaderWindow {
  return LEADER_WINDOWS.some((w) => w.key === value);
}

export type LeaderboardWindowRow = {
  position: number;
  ambassador_id: string;
  full_name: string;
  college: string | null;
  city: string | null;
  batch: string | null;
  points: number;
  is_me: boolean;
};

/**
 * The leaderboard for a time window, optionally narrowed by city, batch or
 * phase.
 *
 * A separate function from `getLeaderboard()` rather than a parameter on it:
 * the all-time board is what the dashboard's rank widget reads on every page
 * load, and it should keep hitting the simpler, already-cached query.
 */
export const getLeaderboardWindow = cache(
  async (opts: {
    window?: LeaderWindow;
    city?: string | null;
    batch?: string | null;
    phase?: Enums<"program_phase"> | null;
    limit?: number;
  } = {}): Promise<LeaderboardWindowRow[]> => {
    if (isDemoMode()) {
      const { demoLeaderboard } = await import("@/lib/demo-data");
      return demoLeaderboard.map((r) => ({ ...r, city: null, batch: null }));
    }

    const supabase = await createClient();
    const { data } = await supabase.rpc("leaderboard_window", {
      window_key: opts.window ?? "all",
      city_filter: opts.city ?? null,
      batch_filter: opts.batch ?? null,
      phase_filter: opts.phase ?? null,
      limit_count: opts.limit ?? 200,
    });
    return data ?? [];
  },
);

export const getMyStandingWindow = cache(
  async (
    window: LeaderWindow = "all",
  ): Promise<{ points: number; position: number; total: number }> => {
    const supabase = await createClient();
    const { data } = await supabase.rpc("my_standing_window", {
      window_key: window,
      phase_filter: null,
    });
    return data?.[0] ?? { points: 0, position: 0, total: 0 };
  },
);

/**
 * The distinct cities and batches that actually have ambassadors in them.
 *
 * Derived from the data rather than read from settings, so a filter can never
 * offer a city that would return an empty board.
 */
export const getCohortFilters = cache(
  async (): Promise<{ cities: string[]; batches: string[] }> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("city, batch")
      .eq("role", "ambassador")
      .eq("status", "active");

    const cities = new Set<string>();
    const batches = new Set<string>();
    for (const row of data ?? []) {
      if (row.city?.trim()) cities.add(row.city.trim());
      if (row.batch?.trim()) batches.add(row.batch.trim());
    }

    return {
      cities: [...cities].sort(),
      batches: [...batches].sort(),
    };
  },
);
