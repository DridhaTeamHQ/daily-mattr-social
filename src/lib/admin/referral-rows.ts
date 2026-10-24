import "server-only";

import type { ReferralRow } from "@/lib/admin/queries";
import { UNASSIGNED, cohortLabel } from "@/lib/admin/scope";
import { matches } from "@/lib/search";

/**
 * The Installs table's search, batch, status and sort, in one place.
 *
 * The page and its Export button both read them. Two copies of "which rows
 * does Batch A under Invited mean" is how a downloaded file ends up
 * disagreeing with the table it was downloaded from.
 */

export const REFERRAL_STATUSES = ["active", "invited", "suspended"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

type RawParams = {
  q?: string | string[] | null;
  batch?: string | string[] | null;
  status?: string | string[] | null;
  sort?: string | string[] | null;
};

export type ReferralFilters = {
  query: string;
  batch: string | null;
  status: ReferralStatus | null;
  sort: "downloads" | "batch";
};

const first = (value: string | string[] | null | undefined) =>
  Array.isArray(value) ? value[0] : (value ?? undefined);

export const batchOf = (row: { batch: string | null }) =>
  cohortLabel("batch", row.batch ?? "");

/**
 * Batch A, Batch B, Batch 10 after Batch 9 — and the people with no batch set
 * at the end, where a gap in the data belongs.
 */
export const compareBatch = (a: string, b: string) =>
  Number(a === UNASSIGNED) - Number(b === UNASSIGNED) ||
  a.localeCompare(b, undefined, { numeric: true });

export function readReferralFilters(params: RawParams): ReferralFilters {
  // Batches are canonicalised the same way the analytics filters do it, so
  // "batch a", "Batch A" and "A" on three profiles are one choice and the
  // value in the URL matches what the dropdown offers.
  const rawBatch = first(params.batch);
  const batch =
    typeof rawBatch === "string" && rawBatch.trim()
      ? cohortLabel("batch", rawBatch)
      : null;

  // Only the three statuses the badge knows; anything else in the URL is
  // ignored rather than filtering the table down to nobody.
  const rawStatus = first(params.status);
  const status = REFERRAL_STATUSES.includes(rawStatus as ReferralStatus)
    ? (rawStatus as ReferralStatus)
    : null;

  // Anything but "batch" is the ranking the page exists for.
  const sort = first(params.sort) === "batch" ? "batch" : "downloads";

  return { query: first(params.q) ?? "", batch, status, sort };
}

/**
 * The rows on show, in the order shown.
 *
 * Grouped by batch when asked, and by code inside each group: codes are issued
 * in batch order (DMA07, DMA13, DMA18 ...), so this is the order the roster
 * was handed out in, and the one a printed list is checked against.
 * Numeric-aware, so DMA10 follows DMA09 rather than DMA1. The summary already
 * comes ranked by downloads, so the other order needs no sort at all.
 */
export function applyReferralFilters(
  all: ReferralRow[],
  { query, batch, status, sort }: ReferralFilters,
): ReferralRow[] {
  const rows = all.filter(
    (r) =>
      (batch === null || batchOf(r) === batch) &&
      (status === null || r.status === status) &&
      matches(query, r.full_name, r.email, r.college, r.referral_code),
  );
  if (sort === "batch") {
    rows.sort(
      (a, b) =>
        compareBatch(batchOf(a), batchOf(b)) ||
        a.referral_code.localeCompare(b.referral_code, undefined, {
          numeric: true,
        }) ||
        a.full_name.localeCompare(b.full_name),
    );
  }
  return rows;
}

/**
 * Where each ambassador places, by download count rather than by row.
 *
 * Dense ranking, the same as the ambassadors' own podium: everybody on seven
 * downloads is 2nd and the next count down is 3rd, not 5th. Computed over the
 * whole board and read by id, so narrowing the table never renumbers anybody.
 */
export function referralPlaces(all: ReferralRow[]): Map<string, number> {
  const places = new Map<string, number>();
  let place = 0;
  let previous: number | null = null;
  for (const row of all) {
    if (row.confirmed !== previous) {
      place += 1;
      previous = row.confirmed;
    }
    places.set(row.id, place);
  }
  return places;
}
