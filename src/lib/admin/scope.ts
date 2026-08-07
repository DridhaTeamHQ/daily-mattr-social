import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Who a page is about.
 *
 * Grouping used to be a property of one card: the Breakdown listed colleges,
 * and every other number on the screen stayed programme-wide. So an admin who
 * picked "By college" to look at GIET was reading a GIET list directly above a
 * success rate, a download total and a money figure that were about everybody
 * — four numbers that look like they belong to the heading above them and do
 * not.
 *
 * This makes the grouping the page's filter instead. Pick a dimension, pick a
 * value, and every tile, chart and table below is about those ambassadors and
 * nothing else. The cohort is resolved once, to a set of ids, and threaded
 * into each query rather than applied afterwards — a total filtered after the
 * fact is a total of the rows that survived, which is not the same number.
 */

export const DIMENSIONS = [
  { key: "city", label: "By city" },
  { key: "batch", label: "By batch" },
  { key: "college", label: "By college" },
] as const;

export type Dimension = (typeof DIMENSIONS)[number]["key"];

/**
 * The people a query is restricted to.
 *
 * `null` means everyone, and is not the same as an empty set, which means
 * nobody. Collapsing the two would make an unmatched filter silently show the
 * whole programme.
 */
export type CohortIds = ReadonlySet<string> | null;

/**
 * Canonical label for a grouping value.
 *
 * Admins type these by hand and import them from spreadsheets, so "hyderabad",
 * "Hyderabad" and "Hyderabad " all arrive. Grouping on the raw string split one
 * city into three rows that each looked like a small city, which is worse than
 * useless — it understates every one of them.
 *
 * Batches keep their letter or number in a consistent "Batch X" form, so "2",
 * "batch 2" and "Batch 2" are one group.
 *
 * Every consumer must call this. The filter chips and the breakdown rows are
 * built from the same function on purpose: if they canonicalised differently,
 * clicking a row's label would select a cohort containing nobody.
 */
export function cohortLabel(field: Dimension, raw: string): string {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return "Unassigned";

  if (field === "batch") {
    const digits = value.match(/\d+/);
    if (digits) return `Batch ${Number(digits[0])}`;
    const letter = value.replace(/batch/gi, " ").trim().match(/[a-z]/i);
    if (letter) return `Batch ${letter[0].toUpperCase()}`;
  }

  // Title case, but only for words that are lower case already — "VIT" and
  // "JNTU" must not become "Vit" and "Jntu".
  return value
    .split(" ")
    .map((word) =>
      word === word.toLowerCase()
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word,
    )
    .join(" ");
}

export type Cohort = {
  dimension: Dimension;
  /** The chosen value, or null for the whole programme. */
  value: string | null;
  ids: CohortIds;
  /** Every value on this dimension, biggest first, for the picker. */
  values: { label: string; ambassadors: number }[];
  /** Everyone on the programme, so "Everyone" can carry a count too. */
  total: number;
  /**
   * True when a value was asked for and matched nobody — a stale link, or a
   * college that has since been renamed. The page says so rather than
   * quietly showing programme-wide figures under that heading.
   */
  empty: boolean;
};

export const getCohort = cache(
  async (dimension: Dimension, value: string | null): Promise<Cohort> => {
    const db = createAdminClient();

    const { data } = await db
      .from("profiles")
      .select("id, city, batch, college")
      .eq("role", "ambassador")
      .eq("status", "active");

    const profiles = data ?? [];
    const counts = new Map<string, number>();
    const ids = new Set<string>();

    for (const profile of profiles) {
      const key = cohortLabel(dimension, profile[dimension] ?? "");
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (value !== null && key === value) ids.add(profile.id);
    }

    return {
      dimension,
      value,
      ids: value === null ? null : ids,
      values: [...counts.entries()]
        .map(([label, ambassadors]) => ({ label, ambassadors }))
        .sort(
          (a, b) =>
            b.ambassadors - a.ambassadors || a.label.localeCompare(b.label),
        ),
      total: profiles.length,
      empty: value !== null && ids.size === 0,
    };
  },
);
