import { Fragment } from "react";
import { Gift, TrendingUp, Users } from "lucide-react";

import Link from "next/link";

import { AmbassadorNav } from "@/components/ambassador-nav";
import { DownloadsCell } from "@/components/downloads-cell";
import { ParamSelect } from "@/components/param-select";
import { ReferralLinkLock } from "@/components/referral-link-lock";
import { SearchBox } from "@/components/search-box";
import { matches } from "@/lib/search";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { getReferralSummary } from "@/lib/admin/queries";
import { UNASSIGNED, cohortLabel } from "@/lib/admin/scope";
import { getUnlockAt, isUnlocked } from "@/lib/settings";
import { cn, formatDate, initials } from "@/lib/utils";

export const metadata = { title: "Installs" };

const STATUS_TONE = {
  active: "ok",
  invited: "warn",
  suspended: "bad",
} as const;

export default async function AdminInstallsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    batch?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const [{ q, batch: rawBatch, sort: rawSort }, summary, linkUnlockAt] =
    await Promise.all([
      searchParams,
      getReferralSummary(),
      getUnlockAt("referral_link_unlock_at"),
    ]);

  // Batches are canonicalised the same way the analytics filters do it, so
  // "batch a", "Batch A" and "A" on three profiles are one choice here and
  // the value in the URL matches what the dropdown offers.
  const rawBatchValue = Array.isArray(rawBatch) ? rawBatch[0] : rawBatch;
  const batch =
    typeof rawBatchValue === "string" && rawBatchValue.trim()
      ? cohortLabel("batch", rawBatchValue)
      : null;
  const batchOf = (row: { batch: string | null }) =>
    cohortLabel("batch", row.batch ?? "");

  // Counted over everyone rather than the search results: the dropdown is
  // for switching batch, and a batch that the current search happens to miss
  // is still a batch worth switching to.
  const batchCounts = new Map<string, number>();
  for (const row of summary.rows) {
    const label = batchOf(row);
    batchCounts.set(label, (batchCounts.get(label) ?? 0) + 1);
  }
  if (batch !== null && !batchCounts.has(batch)) batchCounts.set(batch, 0);
  // Batch A, Batch B, Batch 10 after Batch 9 — and the people with no batch
  // set at the end, where a gap in the data belongs. One comparator for the
  // dropdown and the table, so the order offered is the order shown.
  const compareBatch = (a: string, b: string) =>
    Number(a === UNASSIGNED) - Number(b === UNASSIGNED) ||
    a.localeCompare(b, undefined, { numeric: true });
  const batchOptions = [...batchCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => compareBatch(a.value, b.value));

  // Anything but "batch" is the ranking the page exists for. The default is
  // not written to the URL, so a plain /admin/referrals link keeps meaning
  // the leaderboard.
  const sort =
    (Array.isArray(rawSort) ? rawSort[0] : rawSort) === "batch"
      ? "batch"
      : "downloads";

  const query = q ?? "";
  const rows = summary.rows.filter(
    (r) =>
      (batch === null || batchOf(r) === batch) &&
      matches(query, r.full_name, r.email, r.college, r.referral_code),
  );
  // Grouped by batch when asked, and by code inside each group: the codes
  // are issued in batch order (DMA07, DMA13, DMA18 ...), so this is the order
  // the roster was handed out in, and the one a printed list is checked
  // against. Numeric-aware, so DMA10 follows DMA09 rather than DMA1. The
  // summary already comes ranked by downloads, so the other order needs no
  // sort at all.
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
  // How many of the rows on show are in each batch, for the group headings.
  const groupSizes = new Map<string, number>();
  for (const row of rows) {
    groupSizes.set(batchOf(row), (groupSizes.get(batchOf(row)) ?? 0) + 1);
  }
  const narrowed = Boolean(query) || batch !== null;

  /**
   * Where each ambassador places, by download count rather than by row.
   *
   * Dense ranking, the same as the ambassadors' own podium: everybody on seven
   * downloads is 2nd and the next count down is 3rd, not 5th. Ranking by row
   * number instead would tell four people level on seven that one of them is
   * second and another fourth, which is a difference the numbers do not have.
   *
   * Computed over the whole board and read by id, so filtering the table with
   * the search box narrows what is shown without renumbering anybody.
   */
  const places = new Map<string, number>();
  let place = 0;
  let previous: number | null = null;
  for (const row of summary.rows) {
    if (row.confirmed !== previous) {
      place += 1;
      previous = row.confirmed;
    }
    places.set(row.id, place);
  }

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
        <h1 className="display text-[26px] leading-none text-ink">Installs</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          Every ambassador&apos;s code, and how many app downloads it has
          brought in.
        </p>
        </div>
        <AmbassadorNav />
      </div>

      {/* Above the numbers on purpose: it governs what ambassadors can see, so
          it is not a setting buried under a table of results. */}
      <ReferralLinkLock
        unlockAt={linkUnlockAt ? linkUnlockAt.toISOString() : null}
        open={isUnlocked(linkUnlockAt)}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Confirmed downloads"
          value={summary.totals.confirmed}
          sub="Across all codes"
          icon={Gift}
          tone="invite"
        />
        <Stat
          label="Ambassadors converting"
          value={summary.totals.ambassadorsWithAny}
          sub={`of ${summary.rows.length} on the programme`}
          icon={Users}
          tone="brand"
        />
        <Stat
          label="Voided"
          value={summary.totals.voided}
          sub={summary.totals.voided > 0 ? "Reversed after import" : "None"}
          icon={TrendingUp}
          tone="reel"
        />
      </div>

      {/* Search and batch on one line, both writing to the URL, so a batch's
          ranking can be linked and a name can be looked for inside it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox
          placeholder="Search by name, email, college/office or code…"
          className="w-full max-w-md"
        />
        <div className="flex flex-wrap items-center gap-3">
          <ParamSelect
            param="batch"
            label="Batch"
            any="All batches"
            value={batch}
            options={batchOptions}
          />
          <ParamSelect
            param="sort"
            label="Sort"
            any="Downloads"
            value={sort === "batch" ? "batch" : null}
            options={[{ value: "batch", label: "Batch" }]}
          />
        </div>
      </div>

      {summary.totals.confirmed === 0 && (
        <Note tone="warn" title="No conversions yet">
          Click any download number to set it by hand. The ambassador is notified.
        </Note>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Gift}
            title={narrowed ? "Nobody matches that" : "No ambassadors yet"}
            description={
              narrowed
                ? "Try a different name, email or code, or switch batch."
                : "Add ambassadors and their referral codes appear here automatically."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr className="text-[11.5px] font-extrabold tracking-wide text-ink uppercase">
                  <th className="px-4 py-3">Ambassador</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3 text-right">Downloads (editable)</th>
                  <th className="px-4 py-3">Last one</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {rows.map((row, index) => (
                  <Fragment key={row.id}>
                    {/* A heading where one batch ends and the next begins,
                        only when the table is in batch order — in download
                        order the batches interleave and a heading would be
                        a lie about the rows beneath it. */}
                    {sort === "batch" &&
                      (index === 0 || batchOf(rows[index - 1]) !== batchOf(row)) && (
                        <tr className="bg-canvas-sunk">
                          <td
                            colSpan={5}
                            className="px-4 py-2 text-[11.5px] font-extrabold tracking-wide text-ink-soft uppercase"
                          >
                            {batchOf(row)}
                            <span className="ml-2 font-bold text-ink-faint normal-case">
                              {groupSizes.get(batchOf(row))}{" "}
                              {groupSizes.get(batchOf(row)) === 1
                                ? "ambassador"
                                : "ambassadors"}
                            </span>
                          </td>
                        </tr>
                      )}
                  <tr className="hover:bg-canvas-sunk/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {/* Only the top three counts get a rank chip — beyond
                            that it is a list, not a podium. Everybody level on
                            a count wears the same chip, which is the point. */}
                        <span
                          className={cn(
                            "tabular grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-extrabold text-ink",
                            (places.get(row.id) ?? 0) <= 3 && row.confirmed > 0
                              ? cn(
                                  ["bg-brand", "bg-canvas-sunk", "bg-invite-tint"][
                                    (places.get(row.id) ?? 1) - 1
                                  ],
                                )
                              : "text-ink-faint",
                          )}
                        >
                          {places.get(row.id)}
                        </span>

                        <span
                          aria-hidden
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-extrabold text-ink"
                        >
                          {initials(row.full_name || row.email)}
                        </span>

                        <div className="min-w-0">
                          <Link
                            href={`/admin/ambassadors/${row.id}`}
                            className="truncate text-[13.5px] font-extrabold text-ink underline decoration-[3px] underline-offset-4 hover:decoration-invite"
                          >
                            {row.full_name || "—"}
                          </Link>
                          {/* The batch rides along after the college, so the
                              dropdown's effect can be checked against the rows
                              it leaves — and nobody has to open a profile to
                              learn which batch a top scorer is in. */}
                          <p className="truncate text-[12px] text-ink-soft">
                            {row.college ?? row.email}
                            {row.batch && ` · ${batchOf(row)}`}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <code className="font-mono text-[12.5px] font-bold text-ink">
                        {row.referral_code}
                      </code>
                    </td>

                    <td className="px-4 py-3">
                      <DownloadsCell
                        profileId={row.id}
                        name={row.full_name || row.email}
                        value={row.confirmed}
                      />
                    </td>


                    <td className="px-4 py-3 text-[12.5px] text-ink-soft">
                      {row.lastConversion ? formatDate(row.lastConversion) : "—"}
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[row.status]} dot>
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
