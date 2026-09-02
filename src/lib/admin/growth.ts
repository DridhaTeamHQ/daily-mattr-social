import "server-only";

import { cache } from "react";

import { createCachedAdminClient as createAdminClient } from "@/lib/admin/cached-client";
import { getSettings } from "@/lib/settings";
import { readAll } from "@/lib/admin/read-all";
import { cohortLabel, type CohortIds, type Dimension } from "@/lib/admin/scope";

/**
 * Goal tracking, the download funnel, geography and review operations.
 *
 * The programme's success metric is a hard number — 10,000 downloads — which
 * makes a running total the least useful thing to show. "3,412 downloads"
 * cannot tell you whether you are going to make it. Velocity and a projected
 * date can, and they are the two numbers this file exists to produce.
 */

const DAY_MS = 86_400_000;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Last `count` days as ISO dates, oldest first. */
function dayRange(count: number): string[] {
  const today = Date.now();
  return Array.from({ length: count }, (_, i) =>
    isoDay(new Date(today - (count - 1 - i) * DAY_MS)),
  );
}

export type GoalTracking = {
  goal: number;
  total: number;
  pct: number;
  remaining: number;
  /** Mean downloads per day over the trailing 7 days. */
  velocity7: number;
  /** Mean per day across the whole selected window. */
  velocityWindow: number;
  /** How many days that window covers, so labels can say so honestly. */
  windowDays: number;
  /** Null when velocity is zero — a date is not knowable, and 'never' is not a date. */
  projectedDate: string | null;
  daysRemaining: number | null;
  byStore: { label: string; value: number; color?: string }[];
  byPhase: { label: string; value: number }[];
  perDay: { day: string; value: number }[];
  rolling7: { day: string; value: number }[];
};

export const getGoalTracking = cache(
  async (days = 30, scope: CohortIds = null): Promise<GoalTracking> => {
  const db = (await createAdminClient());
  const { download_goal: goal } = await getSettings("download_goal");

  // Paged, because this is the table the 10,000-download goal counts. A plain
  // select stops at a thousand, and the tracker would have read 1,000 for the
  // rest of the programme.
  const conversions = await readAll<{
    ambassador_id: string;
    converted_at: string;
    store: string | null;
  }>(
    (from, to) =>
      db
        .from("referral_conversions")
        .select("ambassador_id, converted_at, store")
        .eq("status", "counted")
        .order("id")
        .range(from, to),
    "goalTracking.conversions",
  );

  // Filtered here rather than in the query: the cohort is a set of ids the
  // page already holds, and an `.in()` with a few hundred uuids is a URL long
  // enough to be refused before it is a query.
  const rows = (conversions ?? []).filter(
    (row) => !scope || scope.has(row.ambassador_id),
  );
  const total = rows.length;

  const span = dayRange(days);
  const counts = new Map(span.map((d) => [d, 0]));
  for (const row of rows) {
    const day = row.converted_at.slice(0, 10);
    if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const perDay = span.map((day) => ({ day, value: counts.get(day) ?? 0 }));

  // A 7-day trailing mean, not a raw daily count. Downloads arrive in bursts
  // when someone posts, and a raw line makes every quiet Tuesday look like a
  // collapse.
  const rolling7 = perDay.map((point, i) => {
    const window = perDay.slice(Math.max(0, i - 6), i + 1);
    const sum = window.reduce((acc, p) => acc + p.value, 0);
    return { day: point.day, value: Math.round((sum / window.length) * 10) / 10 };
  });

  const last7 = perDay.slice(-7).reduce((sum, p) => sum + p.value, 0);
  const velocity7 = last7 / 7;
  const velocityWindow =
    perDay.reduce((sum, p) => sum + p.value, 0) / Math.max(1, days);

  const remaining = Math.max(0, goal - total);
  const daysRemaining =
    velocity7 > 0 ? Math.ceil(remaining / velocity7) : null;

  const projectedDate =
    daysRemaining === null
      ? null
      : new Date(Date.now() + daysRemaining * DAY_MS).toLocaleDateString(
          "en-IN",
          { day: "numeric", month: "long", year: "numeric" },
        );

  const storeCount = (key: string) =>
    rows.filter((r) => r.store === key).length;

  return {
    goal,
    total,
    pct: goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0,
    remaining,
    velocity7: Math.round(velocity7 * 10) / 10,
    velocityWindow: Math.round(velocityWindow * 10) / 10,
    windowDays: days,
    projectedDate,
    daysRemaining,
    byStore: [
      { label: "Play Store", value: storeCount("play_store") },
      { label: "App Store", value: storeCount("app_store") },
      { label: "Unattributed", value: storeCount("unknown") },
    ],
    byPhase: [],
    perDay,
    rolling7,
  };
  },
);

// ─── Funnel ─────────────────────────────────────────────────────────────────

export type FunnelStage = {
  label: string;
  value: number;
  /** Share of the stage above. Null on the first stage, which has none. */
  conversion: number | null;
  dropOff: number | null;
};

export const getFunnel = cache(async (): Promise<FunnelStage[]> => {
  const db = (await createAdminClient());

  const [{ count: clicks }, conversions] = await Promise.all([
    db.from("referral_clicks").select("id", { count: "exact", head: true }),
    readAll<{
      onboarded_at: string | null;
      activated_at: string | null;
      day3_return_at: string | null;
      day7_return_at: string | null;
    }>(
      (from, to) =>
        db
          .from("referral_conversions")
          .select("onboarded_at, activated_at, day3_return_at, day7_return_at")
          .eq("status", "counted")
          .order("id")
          .range(from, to),
      "funnel.conversions",
    ),
  ]);

  const rows = conversions ?? [];

  const raw = [
    { label: "Link clicks", value: clicks ?? 0 },
    { label: "Installs", value: rows.length },
    { label: "Onboarded", value: rows.filter((r) => r.onboarded_at).length },
    { label: "First article read", value: rows.filter((r) => r.activated_at).length },
    { label: "Day 3 return", value: rows.filter((r) => r.day3_return_at).length },
    { label: "Day 7 return", value: rows.filter((r) => r.day7_return_at).length },
  ];

  return raw.map((stage, i) => {
    const previous = i === 0 ? null : raw[i - 1].value;
    const conversion =
      previous === null || previous === 0 ? null : stage.value / previous;
    return {
      ...stage,
      conversion,
      dropOff: conversion === null ? null : 1 - conversion,
    };
  });
});

// ─── Geography and cohort ───────────────────────────────────────────────────

export type CohortSlice = {
  label: string;
  ambassadors: number;
  downloads: number;
  points: number;
  /** Downloads per head — the comparable number when groups differ in size. */
  perHead: number;
};

async function sliceBy(
  field: Dimension,
  scope: CohortIds,
): Promise<CohortSlice[]> {
  const db = (await createAdminClient());

  const [profiles, conversions, ledger] = await Promise.all([
    readAll<{
      id: string;
      city: string | null;
      batch: string | null;
      college: string | null;
    }>(
      (from, to) =>
        db
          .from("profiles")
          .select("id, city, batch, college")
          .eq("role", "ambassador")
          .eq("status", "active")
          .order("id")
          .range(from, to),
      "sliceBy.profiles",
    ),
    readAll<{ ambassador_id: string }>(
      (from, to) =>
        db
          .from("referral_conversions")
          .select("ambassador_id")
          .eq("status", "counted")
          .order("id")
          .range(from, to),
      "sliceBy.conversions",
    ),
    readAll<{ ambassador_id: string; delta: number }>(
      (from, to) =>
        db
          .from("point_ledger")
          .select("ambassador_id, delta")
          .order("id")
          .range(from, to),
      "sliceBy.ledger",
    ),
  ]);

  const groupOf = new Map<string, string>();
  const groups = new Map<string, CohortSlice>();

  for (const profile of profiles ?? []) {
    // A cohort filter narrows the split rather than replacing it: inside
    // "College: GIET", splitting by city answers which GIET campuses are
    // carrying it, and a group nobody in the cohort belongs to must not
    // appear at all — a row of zeroes reads as a failing group.
    if (scope && !scope.has(profile.id)) continue;

    const key = cohortLabel(field, profile[field] ?? "");
    groupOf.set(profile.id, key);
    const existing = groups.get(key);
    if (existing) existing.ambassadors += 1;
    else
      groups.set(key, {
        label: key,
        ambassadors: 1,
        downloads: 0,
        points: 0,
        perHead: 0,
      });
  }

  for (const row of conversions ?? []) {
    const key = groupOf.get(row.ambassador_id);
    const group = key ? groups.get(key) : undefined;
    if (group) group.downloads += 1;
  }

  for (const row of ledger ?? []) {
    const key = groupOf.get(row.ambassador_id);
    const group = key ? groups.get(key) : undefined;
    if (group) group.points += row.delta;
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      // Rounded to one decimal: "1.4 downloads each" is a real difference from
      // 1.0, and rounding to whole numbers would hide it.
      perHead:
        group.ambassadors > 0
          ? Math.round((group.downloads / group.ambassadors) * 10) / 10
          : 0,
    }))
    .sort((a, b) => b.downloads - a.downloads);
}

export const getGeography = cache(
  async (
    scope: CohortIds = null,
  ): Promise<{ cities: CohortSlice[]; batches: CohortSlice[]; colleges: CohortSlice[] }> => {
    const [cities, batches, colleges] = await Promise.all([
      sliceBy("city", scope),
      sliceBy("batch", scope),
      sliceBy("college", scope),
    ]);
    return { cities, batches, colleges };
  },
);

// ─── Review operations ──────────────────────────────────────────────────────

export type ReviewOps = {
  submitted: number;
  reviewed: number;
  pending: number;
  /** Median hours from upload to decision. Median, not mean — see below. */
  medianHours: number | null;
  slowestHours: number | null;
};

export const getReviewOps = cache(async (): Promise<ReviewOps> => {
  const db = (await createAdminClient());

  const rows = await readAll<{
    uploaded_at: string;
    reviewed_at: string | null;
    status: string;
  }>(
    (from, to) =>
      db
        .from("submissions")
        .select("uploaded_at, reviewed_at, status")
        .order("id")
        .range(from, to),
    "reviewOps.submissions",
  );

  const decided = rows.filter((r) => r.reviewed_at);
  const durations = decided
    .map(
      (r) =>
        (new Date(r.reviewed_at as string).getTime() -
          new Date(r.uploaded_at).getTime()) /
        3_600_000,
    )
    .filter((hours) => hours >= 0)
    .sort((a, b) => a - b);

  // Median rather than mean: one submission left over a long weekend drags a
  // mean into uselessness, and the question being asked is "how long does a
  // normal upload wait".
  const median =
    durations.length === 0
      ? null
      : Math.round(durations[Math.floor(durations.length / 2)] * 10) / 10;

  return {
    submitted: rows.length,
    reviewed: decided.length,
    pending: rows.filter(
      (r) => r.status === "pending" || r.status === "needs_review",
    ).length,
    medianHours: median,
    slowestHours:
      durations.length === 0
        ? null
        : Math.round(durations[durations.length - 1] * 10) / 10,
  };
});
