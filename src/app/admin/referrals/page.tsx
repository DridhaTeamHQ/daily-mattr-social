import { Fragment } from "react";
import { Download, Gift, TrendingUp, Users } from "lucide-react";

import Link from "next/link";

import { DownloadsCell } from "@/components/downloads-cell";
import { ParamSelect } from "@/components/param-select";
import { FeatureLock } from "@/components/feature-lock";
import { SearchBox } from "@/components/search-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { setReferralLinkUnlock, setStipendUnlock } from "@/lib/admin/actions";
import { getReferralSummary } from "@/lib/admin/queries";
import {
  applyReferralFilters,
  batchOf,
  compareBatch,
  readReferralFilters,
  referralPlaces,
} from "@/lib/admin/referral-rows";
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
    status?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const [
    { q, batch: rawBatch, status: rawStatus, sort: rawSort },
    summary,
    linkUnlockAt,
  ] =
    await Promise.all([
      searchParams,
      getReferralSummary(),
      getUnlockAt("referral_link_unlock_at"),
    ]);

  // The second switch on this page, and deliberately a separate row: these
  // two open on different days for different reasons, and one control that
  // moved both would eventually move the wrong one.
  const stipendUnlockAt = await getUnlockAt("stipend_unlock_at");

  // Shared with the Export button's route, so the file is the table.
  const filters = readReferralFilters({
    q,
    batch: rawBatch,
    status: rawStatus,
    sort: rawSort,
  });
  const { query, batch, status, sort } = filters;

  // Counted over everyone rather than the search results: the dropdown is
  // for switching batch, and a batch that the current search happens to miss
  // is still a batch worth switching to.
  const batchCounts = new Map<string, number>();
  for (const row of summary.rows) {
    const label = batchOf(row);
    batchCounts.set(label, (batchCounts.get(label) ?? 0) + 1);
  }
  if (batch !== null && !batchCounts.has(batch)) batchCounts.set(batch, 0);
  // One comparator for the dropdown and the table, so the order offered is
  // the order shown.
  const batchOptions = [...batchCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => compareBatch(a.value, b.value));

  // Counted over everyone, like the batch counts, so the dropdown says how
  // many are invited before anyone picks it.
  const statusOptions = (
    Object.keys(STATUS_TONE) as (keyof typeof STATUS_TONE)[]
  ).map((value) => ({
    value,
    label: value[0].toUpperCase() + value.slice(1),
    count: summary.rows.filter((r) => r.status === value).length,
  }));

  const rows = applyReferralFilters(summary.rows, filters);
  // How many of the rows on show are in each batch, for the group headings.
  const groupSizes = new Map<string, number>();
  for (const row of rows) {
    groupSizes.set(batchOf(row), (groupSizes.get(batchOf(row)) ?? 0) + 1);
  }
  const narrowed = Boolean(query) || batch !== null || status !== null;

  // Dense ranking over the whole board — see referralPlaces.
  const places = referralPlaces(summary.rows);

  // The Export button carries the same filters, so the file is this table.
  const exportParams = new URLSearchParams();
  if (query) exportParams.set("q", query);
  if (batch !== null) exportParams.set("batch", batch);
  if (status !== null) exportParams.set("status", status);
  if (sort === "batch") exportParams.set("sort", "batch");
  const exportHref = `/admin/referrals/export${exportParams.size ? `?${exportParams}` : ""}`;

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
        {/* A plain <a>, not <Link>: the response is a file download, and
            client-side navigation to one never finishes. */}
        <Button variant="secondary" asChild>
          <a href={exportHref} download>
            <Download aria-hidden />
            Export
          </a>
        </Button>
      </div>

      {/* Above the numbers on purpose: it governs what ambassadors can see, so
          it is not a setting buried under a table of results. */}
      <FeatureLock
        title="Share links"
        openCopy="Open. Every ambassador can see their link and the shareable card."
        lockedCopy="Locked. Ambassadors see their referral code and a note saying links are not open yet."
        footnote="The code itself always works — this only controls the link and the share card. Their install count is never hidden."
        scheduleLabel="Or open it automatically at"
        onSet={setReferralLinkUnlock}
        unlockAt={linkUnlockAt ? linkUnlockAt.toISOString() : null}
        open={isUnlocked(linkUnlockAt)}
      />

      <FeatureLock
        title="Stipend visibility"
        openCopy="Open. Every ambassador can see this month's stipend and where they stand against it."
        lockedCopy="Locked. Ambassadors see a note on their rewards page saying the stipend is not open yet."
        footnote="Tasks and installs keep counting either way — this only controls whether students can see the figure before the month is settled."
        scheduleLabel="Or show it automatically at"
        onSet={setStipendUnlock}
        unlockAt={stipendUnlockAt ? stipendUnlockAt.toISOString() : null}
        open={isUnlocked(stipendUnlockAt)}
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
            param="status"
            label="Status"
            any="All statuses"
            value={status}
            options={statusOptions}
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
                ? "Try a different name, email or code, or switch batch or status."
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
