import "server-only";

import { cache } from "react";

import { createCachedClient as createClient } from "@/lib/admin/cached-client";
import { readAll } from "@/lib/admin/read-all";

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
 * This makes the grouping the page's filter instead. Pick a city, a college
 * and/or a batch, and every tile, chart and table below is about those
 * ambassadors and nothing else. The cohort is resolved once, to a set of ids,
 * and threaded into each query rather than applied afterwards — a total
 * filtered after the fact is a total of the rows that survived, which is not
 * the same number.
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
export const UNASSIGNED = "Unassigned";

export function cohortLabel(field: Dimension, raw: string): string {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return UNASSIGNED;

  // Already the label for "no value set". Without this, a second pass over it
  // would read the U as a batch letter and turn the group into "Batch U",
  // which matches nobody.
  if (value === UNASSIGNED) return UNASSIGNED;

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

/** One chosen value per dimension. `null` on a dimension means "any". */
export type CohortFilters = Record<Dimension, string | null>;

export const EMPTY_FILTERS: CohortFilters = {
  city: null,
  batch: null,
  college: null,
};

export type Cohort = {
  filters: CohortFilters;
  ids: CohortIds;
  /**
   * The values offered on each dimension, biggest first.
   *
   * Counted against the *other* dimensions' filters rather than the whole
   * programme: once "Batch 2" is picked, a college with nobody in batch 2 is
   * not a choice worth offering, and the counts next to the colleges that
   * remain are the number of people a click would actually show.
   */
  options: Record<Dimension, { label: string; ambassadors: number }[]>;
  /** Ambassadors in the cohort. Equals `total` when nothing is filtered. */
  matched: number;
  /** Everyone on the programme, so "Everyone" can carry a count too. */
  total: number;
  /** True when at least one dimension is filtered. */
  active: boolean;
  /**
   * True when something was asked for and matched nobody — a stale link, or a
   * college that has since been renamed. The page says so rather than
   * quietly showing programme-wide figures under that heading.
   */
  empty: boolean;
};

/** Drop values the URL made up, and normalise the ones it didn't. */
export function readCohortFilters(
  params: Partial<Record<Dimension, string | string[] | undefined>>,
): CohortFilters {
  const filters = { ...EMPTY_FILTERS };
  for (const { key } of DIMENSIONS) {
    const raw = Array.isArray(params[key]) ? params[key][0] : params[key];
    if (typeof raw === "string" && raw.trim()) {
      filters[key] = cohortLabel(key, raw);
    }
  }
  return filters;
}

/**
 * The ambassadors a page is about, and the choices its filter bar can offer.
 *
 * Dimensions combine with AND: city Hyderabad + Batch 2 is the people who are
 * both, not the people who are either. Arguments are the three values rather
 * than an object because this is memoised per request and an object literal
 * would be a new key on every call.
 */
export const getCohort = cache(
  async (
    city: string | null = null,
    college: string | null = null,
    batch: string | null = null,
  ): Promise<Cohort> => {
    const supabase = await createClient();
    const filters: CohortFilters = { city, college, batch };

    const profiles = await readAll<{
      id: string;
      city: string | null;
      batch: string | null;
      college: string | null;
    }>(
      (from, to) =>
        supabase
          .from("profiles")
          .select("id, city, batch, college")
          .eq("role", "ambassador")
          .eq("status", "active")
          .order("id")
          .range(from, to),
      "getCohort.profiles",
    );

    const labelled = profiles.map((profile) => ({
      id: profile.id,
      city: cohortLabel("city", profile.city ?? ""),
      batch: cohortLabel("batch", profile.batch ?? ""),
      college: cohortLabel("college", profile.college ?? ""),
    }));

    const matchesOn = (
      row: (typeof labelled)[number],
      except?: Dimension,
    ): boolean =>
      DIMENSIONS.every(
        ({ key }) =>
          key === except || filters[key] === null || row[key] === filters[key],
      );

    const options = {} as Cohort["options"];
    for (const { key } of DIMENSIONS) {
      const counts = new Map<string, number>();
      for (const row of labelled) {
        if (!matchesOn(row, key)) continue;
        counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
      }
      // A selected value that now matches nobody still has to appear, or the
      // dropdown would silently show a different value than the page is using.
      const chosen = filters[key];
      if (chosen !== null && !counts.has(chosen)) counts.set(chosen, 0);

      options[key] = [...counts.entries()]
        .map(([label, ambassadors]) => ({ label, ambassadors }))
        .sort(
          (a, b) =>
            b.ambassadors - a.ambassadors || a.label.localeCompare(b.label),
        );
    }

    const active = DIMENSIONS.some(({ key }) => filters[key] !== null);
    const ids = active
      ? new Set(labelled.filter((row) => matchesOn(row)).map((row) => row.id))
      : null;

    return {
      filters,
      ids,
      options,
      matched: ids ? ids.size : labelled.length,
      total: labelled.length,
      active,
      empty: ids !== null && ids.size === 0,
    };
  },
);
