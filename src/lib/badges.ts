import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";
import type { Tables } from "@/lib/database.types";

/**
 * Badge evaluation.
 *
 * The criteria live in the `badges` table as small JSON blobs and are read
 * here rather than expressed in SQL. A rules engine written in Postgres would
 * be clever and unreadable, and these rules — "25 valid responses", "one
 * approved task on every platform" — are ordinary code.
 *
 * Awards are idempotent through the unique index on
 * (badge_id, ambassador_id), so this can run on every relevant event without
 * anyone earning the same badge twice.
 */

type Criteria =
  | { kind: "survey_responses"; min: number }
  | { kind: "downloads"; min: number }
  | { kind: "approved_submissions"; min: number }
  | { kind: "streak_weeks"; min: number }
  | { kind: "stipend_months"; min: number }
  | { kind: "platform_sweep" };

/** Everything one person's badges depend on, in one pass. */
type Facts = {
  responses: number;
  downloads: number;
  approved: number;
  streakWeeks: number;
  stipendMonths: number;
  platformsDone: number;
  platformsAvailable: number;
};

function weekKey(date: Date): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

async function gatherFacts(ambassadorId: string): Promise<Facts> {
  const db = createAdminClient();

  const [
    { count: responses },
    { count: downloads },
    { data: submissions },
    { data: ledger },
    { count: stipendMonths },
    { data: library },
  ] = await Promise.all([
    db
      .from("survey_responses")
      .select("id", { count: "exact", head: true })
      .eq("ambassador_id", ambassadorId)
      .eq("status", "valid"),
    db
      .from("referral_conversions")
      .select("id", { count: "exact", head: true })
      .eq("ambassador_id", ambassadorId)
      .eq("status", "counted"),
    db
      .from("submissions")
      .select("status, campaign_tasks(library_id, type)")
      .eq("ambassador_id", ambassadorId)
      .in("status", ["approved", "auto_approved"]),
    db
      .from("point_ledger")
      .select("created_at")
      .eq("ambassador_id", ambassadorId)
      .gt("delta", 0)
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("payouts")
      .select("id", { count: "exact", head: true })
      .eq("ambassador_id", ambassadorId)
      .eq("kind", "stipend"),
    db.from("task_library").select("platform").eq("active", true),
  ]);

  const weeks = new Set(
    (ledger ?? []).map((row) => weekKey(new Date(row.created_at))),
  );
  let streakWeeks = 0;
  const cursor = new Date();
  for (let i = 0; i < 52; i++) {
    if (!weeks.has(weekKey(cursor))) break;
    streakWeeks += 1;
    cursor.setDate(cursor.getDate() - 7);
  }

  // "Every active platform" is read off the library, so adding LinkedIn to the
  // library raises the bar rather than leaving the badge quietly unearnable.
  const platforms = new Set(
    (library ?? [])
      .map((row) => row.platform?.trim())
      .filter((p): p is string => Boolean(p)),
  );

  const done = new Set<string>();
  for (const s of submissions ?? []) {
    const task = s.campaign_tasks as unknown as {
      library_id: string | null;
      type: string | null;
    } | null;
    // A task straight off the enum is an Instagram action by definition.
    if (task?.type) done.add("Instagram");
  }

  return {
    responses: responses ?? 0,
    downloads: downloads ?? 0,
    approved: (submissions ?? []).length,
    streakWeeks,
    stipendMonths: stipendMonths ?? 0,
    platformsDone: [...done].filter((p) => platforms.has(p)).length,
    platformsAvailable: platforms.size,
  };
}

function earned(criteria: Criteria, facts: Facts): boolean {
  switch (criteria.kind) {
    case "survey_responses":
      return facts.responses >= criteria.min;
    case "downloads":
      return facts.downloads >= criteria.min;
    case "approved_submissions":
      return facts.approved >= criteria.min;
    case "streak_weeks":
      return facts.streakWeeks >= criteria.min;
    case "stipend_months":
      return facts.stipendMonths >= criteria.min;
    case "platform_sweep":
      // Guarded: with no platforms in the library, "all of them" is vacuously
      // true and everyone would be handed the badge on day one.
      return (
        facts.platformsAvailable > 0 &&
        facts.platformsDone >= facts.platformsAvailable
      );
    default:
      return false;
  }
}

/** Evaluates every badge for one person and awards the newly earned ones. */
export async function evaluateBadges(ambassadorId: string): Promise<string[]> {
  const db = createAdminClient();

  const [{ data: badges }, { data: held }, facts] = await Promise.all([
    db.from("badges").select("*").eq("active", true),
    db.from("badge_awards").select("badge_id").eq("ambassador_id", ambassadorId),
    gatherFacts(ambassadorId),
  ]);

  const already = new Set((held ?? []).map((row) => row.badge_id));
  const won: string[] = [];

  for (const badge of badges ?? []) {
    if (already.has(badge.id)) continue;
    if (!earned(badge.criteria as unknown as Criteria, facts)) continue;

    const { error } = await db.from("badge_awards").insert({
      badge_id: badge.id,
      ambassador_id: ambassadorId,
      meta: { facts } as never,
    });
    // A duplicate here means a concurrent run won the race, which is fine.
    if (error) continue;

    won.push(badge.label);

    await notify({
      profileId: ambassadorId,
      type: "points_awarded",
      title: `Badge unlocked — ${badge.label}`,
      body: badge.description,
      href: "/dashboard/rewards",
    }).catch(() => {});
  }

  return won;
}

export type BadgeView = Tables<"badges"> & {
  awardedAt: string | null;
};

/** Every badge, with the caller's own earned ones marked. */
export const getMyBadges = cache(async (): Promise<BadgeView[]> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: badges }, { data: mine }] = await Promise.all([
    supabase.from("badges").select("*").eq("active", true).order("sort_order"),
    supabase
      .from("badge_awards")
      .select("badge_id, awarded_at")
      .eq("ambassador_id", user.id),
  ]);

  const awarded = new Map(
    (mine ?? []).map((row) => [row.badge_id, row.awarded_at]),
  );

  // Locked badges are shown too, greyed. A wall of things you have not earned
  // yet is the part that makes the earned ones mean anything.
  return (badges ?? []).map((badge) => ({
    ...badge,
    awardedAt: awarded.get(badge.id) ?? null,
  }));
});
