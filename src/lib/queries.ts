import "server-only";

import { cache } from "react";

import { earningRoute } from "@/lib/admin/participation";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  previewReferralStats,
  previewStreak,
  previewSurveyStats,
} from "@/lib/preview-stats";
import { getViewer } from "@/lib/view-as";
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

const TASK_LABEL: Record<string, string> = {
  like: "Like the reel",
  comment: "Leave a comment",
  share: "Share it",
  story: "Post to story",
};

export type TaskCard = {
  id: string;
  /** Null when the task came from the library rather than the fixed enum. */
  type: Enums<"task_type"> | null;
  points: number;
  instructions: string | null;
  required: boolean;
  /** What the student has to send back: an image, a URL, or prose. */
  proof_type: Enums<"proof_type">;
  /** Library label, an explicit override, or the enum name — in that order. */
  label: string;
  platform: string | null;
  /** The caller's own submission for this task, if any. */
  submission_status: Enums<"submission_status"> | null;
  /**
   * Why it was turned down, in the reviewer's words. Null when it was not
   * rejected, or when the reviewer rejected it without writing anything —
   * the reason is optional on their side.
   */
  submission_reason: string | null;
};

export type CampaignCard = {
  id: string;
  title: string;
  description: string | null;
  /** The network it runs on. Null on campaigns made before the field existed. */
  platform: string | null;
  instagram_url: string;
  /** Shown in the upload dialog so students know what must be visible. */
  expected_handle: string;
  thumbnail_path: string | null;
  /** When it went out. What Tasks sorts on, newest first. */
  starts_at: string;
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

export type CompletionLeaderboardRow = {
  position: number;
  ambassador_id: string;
  full_name: string;
  college: string | null;
  /** The batch they started with. What the board shows under the name. */
  batch: string | null;
  total_tasks: number;
  approved_tasks: number;
  completion_pct: number;
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
  standing: {
    completionPct: number;
    approvedTasks: number;
    totalTasks: number;
    position: number;
    total: number;
    /**
     * The group the position is out of. Their batch, since the board is
     * ranked inside one — null when they have no batch and are therefore
     * ranked against everybody.
     */
    batch: string | null;
  };
  surveys: SurveyStat[];
  campaigns: CampaignCard[];
  referrals: {
    code: string;
    total_confirmed: number;
    points_earned: number;
    last_conversion: string | null;
  };
  recentLedger: LedgerEntry[];
  /** Consecutive days they showed up — signing in included — for the flame. */
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

  /**
   * Every read below keys on the viewer, not the signed-in account.
   *
   * They are the same id unless an admin is previewing a student, in which
   * case this is the whole of the difference — the queries themselves do not
   * change, they just answer about somebody else.
   */
  const viewer = await getViewer();
  const subjectId = viewer?.id ?? user.id;
  const preview = viewer?.isPreview ?? false;

  const [
    profileRes,
    completionBoardRes,
    surveysRes,
    referralsRes,
    ledgerRes,
    streakRes,
    notificationsRes,
    campaigns,
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, college, referral_code, role, status, must_change_password")
        .eq("id", subjectId)
        .maybeSingle(),
      supabase.rpc("completion_leaderboard", { limit_count: 1000 }),
      // The `my_*` RPCs filter on auth.uid() internally, so a preview has to
      // read the same tables directly. See preview-stats.ts.
      preview
        ? Promise.resolve({ data: null, error: null })
        : supabase.rpc("my_survey_stats"),
      preview
        ? Promise.resolve({ data: null, error: null })
        : supabase.rpc("my_referral_stats"),
      supabase
        .from("point_ledger")
        .select("id, delta, reason, note, created_at")
        .eq("ambassador_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(8),
      preview
        ? Promise.resolve({ data: null, error: null })
        : supabase.rpc("my_streak"),
      supabase
        .from("notifications")
        .select("id, type, title, body, href, read_at, created_at")
        .eq("profile_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(20),
      getCampaigns(),
    ]);

  const profile = profileRes.data;
  if (!profile) return null;

  // Say so when the board could not be read. Without this the fallback below
  // renders a confident 0% that is indistinguishable from a real 0%, which is
  // how an unapplied migration once looked like a working page.
  if (completionBoardRes.error) {
    console.error("completion_leaderboard failed", completionBoardRes.error);
  }

  const completionBoard = completionBoardRes.data ?? [];
  // `is_me` is stamped by the database against auth.uid(), so a preview finds
  // its row by id instead. Same row, different way of pointing at it.
  const mine = preview
    ? completionBoard.find((row) => row.ambassador_id === subjectId)
    : completionBoard.find((row) => row.is_me);
  const standing = mine
    ? {
        completionPct: mine.completion_pct,
        approvedTasks: mine.approved_tasks,
        totalTasks: mine.total_tasks,
        position: mine.position,
        total: completionBoard.length,
        batch: mine.batch,
      }
    : {
        completionPct: 0,
        approvedTasks: 0,
        totalTasks: 0,
        position: 0,
        total: 0,
        batch: null,
      };

  const referral = referralsRes.data?.[0];

  // Filled from the direct reads while previewing, from the RPCs otherwise.
  const [previewSurveys, previewReferrals, previewStreakDays] = preview
    ? await Promise.all([
        previewSurveyStats(supabase, subjectId),
        previewReferralStats(supabase, subjectId, profile.referral_code),
        previewStreak(supabase, subjectId),
      ])
    : [null, null, null];

  return {
    profile,
    standing,
    surveys: previewSurveys ?? surveysRes.data ?? [],
    campaigns,
    referrals: previewReferrals ?? {
      code: referral?.code ?? profile.referral_code,
      total_confirmed: referral?.total_confirmed ?? 0,
      points_earned: referral?.points_earned ?? 0,
      last_conversion: referral?.last_conversion ?? null,
    },
    recentLedger: ledgerRes.data ?? [],
    streak: previewStreakDays ?? streakRes.data ?? 0,
    notifications: notificationsRes.data ?? [],
  };
});

export type MyAchievement = {
  id: string;
  title: string;
  note: string | null;
  awarded_at: string;
};

/**
 * The recognition an admin has written onto this student's record.
 *
 * A student reads their own: `achievements_select_own` restricts the table to
 * `ambassador_id = auth.uid()`, so asking for anybody else's returns nothing.
 * An admin previewing a student reads theirs through `achievements_all_admin`.
 */
export const getMyAchievements = cache(async (): Promise<MyAchievement[]> => {
  if (isDemoMode()) {
    const { demoAchievements } = await import("@/lib/demo-data");
    return demoAchievements;
  }

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) return [];

  const subjectId = (await getViewer())?.id ?? user.id;
  const { data } = await supabase
    .from("achievements")
    .select("id, title, note, awarded_at")
    .eq("ambassador_id", subjectId)
    .order("awarded_at", { ascending: false });

  return data ?? [];
});

/**
 * When each live survey was published, keyed by survey id.
 *
 * Tasks shows campaigns and surveys in one list ordered by date, and
 * `my_survey_stats` carries counts rather than timestamps. Read separately
 * instead of widening that RPC, which three other callers depend on. Any
 * signed-in student can select live surveys, so this needs no extra privilege.
 */
export type SurveyMeta = {
  createdAt: string;
  audience: Enums<"survey_audience">;
  /** The survey-wide ceiling an admin set, or null for no limit. */
  responseCap: number | null;
};

/**
 * How many responses finish one survey, from the ambassador's point of view.
 *
 * In order of who decided it:
 *
 *  1. A participant survey is one answer from them and it is done.
 *  2. A response limit set on the survey itself wins next — an admin who asked
 *     for 2 responses meant 2, and showing the programme default of 10 next to
 *     it made the limit look ignored.
 *  3. Otherwise the programme-wide target from `app_settings`.
 *
 * One function because two pages render the same card and a rule this fiddly
 * would not stay identical in two places.
 */
export function surveyTargetFor(
  meta: SurveyMeta | undefined,
  programmeTarget: number,
): number {
  if (meta?.audience === "participant") return 1;
  if (meta?.responseCap && meta.responseCap > 0) return meta.responseCap;
  return programmeTarget;
}

export const getSurveyMeta = cache(
  async (): Promise<Map<string, SurveyMeta>> => {
    // Demo fixtures carry no dates. An empty map sorts every survey to the
    // bottom, which is where they sat before this existed.
    if (isDemoMode()) return new Map();

    const supabase = await createClient();
    const { data } = await supabase
      .from("surveys")
      .select("id, created_at, audience, response_cap")
      .eq("status", "live");

    return new Map(
      (data ?? []).map((survey) => [
        survey.id,
        {
          createdAt: survey.created_at,
          audience: survey.audience,
          responseCap: survey.response_cap,
        },
      ]),
    );
  },
);

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
      "id, title, description, platform, instagram_url, expected_handle, thumbnail_path, starts_at, ends_at, campaign_tasks(id, type, points, instructions, required, order_index, proof_type, label_override, task_library(label, proof_type, platform))",
    )
    .eq("status", "live")
    .order("starts_at", { ascending: false });

  if (!campaigns?.length) return [];

  // Own rows by RLS, or the previewed student's — an admin may read those too,
  // which is what turns "Done 0/1" on every card into their real progress.
  const subjectId = (await getViewer())?.id ?? user.id;
  const { data: mine } = await supabase
    .from("submissions")
    .select("campaign_task_id, status, attempt, reject_reason")
    .eq("ambassador_id", subjectId)
    .order("attempt", { ascending: false });

  // Highest attempt wins — that's the one the student is looking at.
  const latest = new Map<
    string,
    { status: Enums<"submission_status">; reason: string | null }
  >();
  for (const row of mine ?? []) {
    if (!latest.has(row.campaign_task_id)) {
      latest.set(row.campaign_task_id, {
        status: row.status,
        reason: row.reject_reason,
      });
    }
  }

  return campaigns.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    platform: c.platform,
    instagram_url: c.instagram_url,
    expected_handle: c.expected_handle,
    thumbnail_path: c.thumbnail_path,
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    tasks: [...(c.campaign_tasks ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map((t) => ({
        id: t.id,
        type: t.type,
        points: t.points,
        instructions: t.instructions,
        required: t.required,
        // A library task knows its own name and proof; an enum task is an
        // Instagram action and its proof has always been a screenshot.
        proof_type:
          t.proof_type ??
          (t.task_library as unknown as { proof_type: Enums<"proof_type"> } | null)
            ?.proof_type ??
          "screenshot",
        label:
          t.label_override ??
          (t.task_library as unknown as { label: string } | null)?.label ??
          (t.type ? TASK_LABEL[t.type] : "Task"),
        platform:
          (t.task_library as unknown as { platform: string | null } | null)
            ?.platform ?? (t.type ? "Instagram" : null),
        submission_status: latest.get(t.id)?.status ?? null,
        submission_reason: latest.get(t.id)?.reason ?? null,
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

/** The programme-wide current-month board, ranked by approved task completion. */
export const getCompletionLeaderboard = cache(
  async (limit = 200): Promise<CompletionLeaderboardRow[]> => {
    if (isDemoMode()) {
      const { demoCompletionLeaderboard } = await import("@/lib/demo-data");
      return demoCompletionLeaderboard.slice(0, limit);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("completion_leaderboard", {
      limit_count: limit,
    });

    if (error) {
      console.error("completion_leaderboard failed", error);
      return [];
    }

    return data ?? [];
  },
);

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

/**
 * Which earning route a board is scoped to.
 *
 * The keys are the route names `earning_route()` returns in SQL, not the
 * ledger reasons — attribution has to follow `source_type` so a reversal is
 * subtracted from the same route it was credited to.
 */
export type LeaderSource = "campaign" | "survey" | "referral";

export const LEADER_SOURCES: {
  key: LeaderSource;
  label: string;
  /** Downloads are counted but not offered as a filter yet. */
  hidden?: boolean;
}[] = [
  { key: "campaign", label: "Campaigns" },
  { key: "survey", label: "Surveys" },
  { key: "referral", label: "Downloads", hidden: true },
];

export function isLeaderSource(
  value: string | undefined,
): value is LeaderSource {
  return LEADER_SOURCES.some((s) => s.key === value);
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
    source?: LeaderSource | null;
    limit?: number;
  } = {}): Promise<LeaderboardWindowRow[]> => {
    if (isDemoMode()) {
      const { demoLeaderboard } = await import("@/lib/demo-data");
      return demoLeaderboard.map((r) => ({ ...r, city: null, batch: null }));
    }

    // Narrowing to one earning route is the one thing the RPC cannot do, so
    // that case is summed in `getLeaderboardBySource()` instead. Everything
    // else keeps hitting the cheap, already-indexed aggregate.
    if (opts.source) {
      return getLeaderboardBySource({
        window: opts.window ?? "all",
        source: opts.source,
        city: opts.city ?? null,
        batch: opts.batch ?? null,
        limit: opts.limit ?? 200,
      });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("leaderboard_window", {
      window_key: opts.window ?? "all",
      city_filter: opts.city ?? null,
      batch_filter: opts.batch ?? null,
      phase_filter: opts.phase ?? null,
      limit_count: opts.limit ?? 200,
    });

    // A bare `data ?? []` renders a failed call as "No rankings yet", which is
    // indistinguishable from a programme where nobody has scored. Say so.
    if (error) {
      console.error("leaderboard_window failed", error);
      return [];
    }

    return data ?? [];
  },
);

/**
 * The start of a leader window, matching `window_start()` in SQL.
 *
 * UTC throughout, and the week starts Monday, because that is what Postgres'
 * `date_trunc('week', …)` does — an "All time" board and a "This week" board
 * that disagreed about when the week began would be worse than no filter.
 */
function windowStart(window: LeaderWindow): Date | null {
  if (window === "all") return null;

  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  if (window === "day") return start;
  if (window === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  // Monday-start, so Sunday (getUTCDay() === 0) reaches back six days.
  const weekday = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return start;
}

/**
 * The leaderboard for a single earning route.
 *
 * The RPC in 0017 sums the whole ledger and takes no route argument, and RLS
 * stops a student reading anyone else's ledger rows — so this is summed here,
 * over the service-role client, and returns exactly the columns the RPC
 * returns and nothing else. No email, no phone, no per-row detail.
 *
 * Attribution goes through `earningRoute()`, which reads `source_type` first
 * and `reason` only as a fallback: a reversal carries reason 'revoke' and the
 * SAME source_type as the credit it cancels, so keying on reason alone counts
 * a credit and drops the row that took it back.
 */
const getLeaderboardBySource = cache(
  async (opts: {
    window: LeaderWindow;
    source: LeaderSource;
    city?: string | null;
    batch?: string | null;
    limit?: number;
  }): Promise<LeaderboardWindowRow[]> => {
    const user = await currentUser();
    if (!user) return [];

    // Highlights the previewed student's row rather than the admin's, who is
    // not on this board at all — an unhighlighted board would be the one place
    // the preview quietly stopped pretending.
    const subjectId = (await getViewer())?.id ?? user.id;

    const db = createAdminClient();
    const since = windowStart(opts.window);

    let profileQuery = db
      .from("profiles")
      .select("id, full_name, college, city, batch")
      .eq("role", "ambassador")
      .eq("status", "active");

    if (opts.city) profileQuery = profileQuery.eq("city", opts.city);
    if (opts.batch) profileQuery = profileQuery.eq("batch", opts.batch);

    let ledgerQuery = db
      .from("point_ledger")
      .select("ambassador_id, delta, reason, source_type");

    if (since) ledgerQuery = ledgerQuery.gte("created_at", since.toISOString());

    const [profiles, ledger] = await Promise.all([profileQuery, ledgerQuery]);

    if (profiles.error || ledger.error) {
      console.error(
        "leaderboard by source failed",
        profiles.error ?? ledger.error,
      );
      return [];
    }

    const totals = new Map<string, number>();
    for (const row of ledger.data ?? []) {
      if (earningRoute(row) !== opts.source) continue;
      totals.set(
        row.ambassador_id,
        (totals.get(row.ambassador_id) ?? 0) + row.delta,
      );
    }

    // Everyone active is listed, scoring or not — the same reason the RPC uses
    // FILTER over a WHERE. Somebody sitting on zero this week is exactly who
    // the board is meant to nudge.
    const ranked = (profiles.data ?? [])
      .map((p) => ({
        ambassador_id: p.id,
        full_name: p.full_name,
        college: p.college,
        city: p.city,
        batch: p.batch,
        points: totals.get(p.id) ?? 0,
        is_me: p.id === subjectId,
      }))
      .sort(
        (a, b) =>
          b.points - a.points || a.full_name.localeCompare(b.full_name),
      );

    // Standard competition ranking, as `rank() over (order by pts desc)`
    // gives: ties share a position and the next one skips.
    let position = 0;
    let previousPoints: number | null = null;

    return ranked
      .map((row, index) => {
        if (previousPoints === null || row.points !== previousPoints) {
          position = index + 1;
          previousPoints = row.points;
        }
        return { position, ...row };
      })
      .slice(0, opts.limit ?? 200);
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
