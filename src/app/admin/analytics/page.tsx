import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  ListChecks,
  Users,
} from "lucide-react";

import { BarList, ChartCard } from "@/components/charts";
import { CohortFilter } from "@/components/cohort-filter";
import { InfiniteTableBody } from "@/components/infinite-scroll";
import { PeriodFilter } from "@/components/period-filter";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { InfoDot } from "@/components/ui/info-dot";
import { StackedBar, Stat } from "@/components/ui/stat";
import { requireAdmin } from "@/lib/admin/queries";
import { readPeriod, resolvePeriod } from "@/lib/admin/period";
import {
  DIMENSIONS,
  getCohort,
  readCohortFilters,
  type Dimension,
} from "@/lib/admin/scope";
import { createCachedClient as createClient } from "@/lib/admin/cached-client";
import {
  STIPEND_MIN_COMPLETION_PCT,
  STIPEND_MIN_INSTALLS,
  getCompletionByAmbassador,
} from "@/lib/admin/completion";
import { formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<
    Partial<Record<Dimension | "period", string | string[]>>
  >;
}) {
  await requireAdmin();

  const params = await searchParams;
  const filters = readCohortFilters(params);
  const cohort = await getCohort(filters.city, filters.college, filters.batch);
  const periodKey = readPeriod(params.period);
  const period = resolvePeriod(periodKey);

  const supabase = await createClient();

  // Every figure on this page, and the CSV behind Download ambassadors, comes
  // out of one function — see `src/lib/admin/completion.ts` for why.
  const {
    ranked,
    campaignPerformance,
    taskTotal,
    activeCampaigns,
    availableAssignments,
    completedTasks,
    completionPct,
    approvalPct,
    approvedSubmissions,
    pendingReview,
  } = await getCompletionByAmbassador(supabase, { cohort, period });

  // "Hyderabad · Batch 2 · this month", or just the period when nothing is
  // narrowed. Built from the same cohort object the filter row renders from,
  // so the two can never describe different slices.
  const scopeSummary = [
    ...DIMENSIONS.map(({ key }) => cohort.filters[key]).filter(Boolean),
    period.noun,
  ].join(" · ");

  // The whole scope travels to the export now, period included: the file
  // carries this table's figures alongside the lifetime roster, and those
  // columns are meaningless unless it is looking at the same window the
  // screen is. See the comment at the top of that route.
  const exportParams = new URLSearchParams();
  for (const { key } of DIMENSIONS) {
    const value = cohort.filters[key];
    if (value) exportParams.set(key, value);
  }
  exportParams.set("period", periodKey);
  const exportQuery = exportParams.toString();
  const exportHref = `/admin/analytics/export${exportQuery ? `?${exportQuery}` : ""}`;

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">Analytics</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Task completion {period.noun} across{" "}
            {cohort.active
              ? `${formatNumber(cohort.matched)} of ${formatNumber(cohort.total)} active ambassadors.`
              : "active ambassadors."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/analytics/cache" prefetch={false} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-surface px-4 py-2.5 text-[13px] font-extrabold text-ink hover:bg-canvas-sunk">
            Cache health
          </Link>
          {/* A plain <a>, not <Link>: the response is a file download, and
              client-side navigation to one leaves the router waiting for a
              page that never arrives. `download` keeps the tab put even if a
              browser decides it would rather render the CSV. */}
          <a
            href={exportHref}
            download
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-surface px-4 py-2.5 text-[13px] font-extrabold text-ink hover:bg-canvas-sunk"
          >
            <Download className="size-4" aria-hidden />
            Download ambassadors
          </a>

          <Link
            href="/admin/leaderboard"
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-extrabold text-white hover:bg-ink/85"
          >
            <BarChart3 className="size-4" />
            View leaderboard
          </Link>
        </div>
      </div>

      {/* The page's one control bar. Given its own surface so it reads as
          something that governs everything below it, rather than as chrome
          belonging to the tiles it happens to sit above. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-surface p-3 shadow-xs">
        <PeriodFilter period={period.key} />
        <CohortFilter cohort={cohort} />
      </div>

      {cohort.empty ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Nobody matches that filter"
            description="No active ambassador is in every one of the selected city, college/office and batch. Clear one of them to widen the view."
          />
        </Card>
      ) : (
        <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Completion rate"
          value={`${completionPct}%`}
          sub={`${formatNumber(completedTasks)}/${formatNumber(availableAssignments)} approved tasks`}
          icon={CheckCircle2}
          tone="brand"
        />
        <Stat
          label="Active tasks"
          value={taskTotal}
          sub={`${activeCampaigns.length} campaign${activeCampaigns.length === 1 ? "" : "s"} ${period.noun}`}
          icon={ListChecks}
          tone="reel"
        />
        <Stat
          label="Approval rate"
          value={`${approvalPct}%`}
          sub={`${formatNumber(approvedSubmissions)} approved submissions`}
          icon={ClipboardCheck}
          tone="poll"
        />
        <Stat
          label="Awaiting review"
          value={pendingReview}
          sub={`Undecided submissions ${period.noun}`}
          icon={Clock3}
          tone="invite"
        />
      </div>

      {taskTotal === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title={`No active tasks ${period.noun}`}
            description="Publish a campaign task to start tracking completion percentages."
          />
        </Card>
      ) : (
        <ChartCard
          title="Task completion"
          hint="Approved tasks divided by the tasks available to the ambassadors who were in the programme before the task closed. Open a bar for who has done it and who has not."
        >
          <BarList
            data={campaignPerformance}
            unit="%"
            color="teal"
            emptyMessage={`No active tasks ${period.noun}.`}
          />
        </ChartCard>
      )}

      <Card className="overflow-hidden">
        <CardBody className="pb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="display text-[16px] text-ink">Completion by ambassador</h2>
              {/* No second filter row here. One set of controls, at the top of
                  the page, scoping everything on it — two identical rows read
                  as two independent filters even when they drive the same URL.
                  This line is what tells the table apart from an unfiltered
                  one: it names the slice the controls above have selected. */}
              <p className="mt-1 text-[12.5px] text-ink-soft">
                {formatNumber(ranked.length)}{" "}
                {ranked.length === 1 ? "ambassador" : "ambassadors"} ·{" "}
                {scopeSummary}
              </p>
            </div>
            {/* The key to the bar, in the corner the decorative icon used
                to hold. Three states on one track need naming exactly once,
                and up here they are read before the first row is. */}
            <ul className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11.5px] font-bold text-ink-soft">
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full bg-brand" />
                Approved
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full bg-bad" />
                Rejected
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 rounded-full border border-gray-300 bg-surface"
                />
                Pending
              </li>
            </ul>
          </div>
        </CardBody>

        {ranked.length === 0 ? (
          <CardBody>
            <EmptyState title="No active ambassadors" />
          </CardBody>
        ) : (
          // Horizontal scroll rather than dropping columns: the counts have
          // to stay readable next to the completion they explain. College and
          // city are not among them — they are the longest fields on the row
          // and the ones the filters above already say, so they buy nothing
          // here and cost the width the stipend columns need.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left">
              <thead className="border-y border-line bg-canvas-sunk">
                <tr className="text-[11.5px] tracking-wide text-ink-faint uppercase">
                  <th className="w-12 px-4 py-2.5 text-center font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Ambassador</th>
                  <th className="px-4 py-2.5 font-medium">Batch</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Approved</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Rejections
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">Installs</th>
                  {/* The rule lives on the column it governs rather than in
                      a caption over the table: "Eligible" and "Needs 4 more
                      tasks" are the only cells anyone has to interpret, and
                      the "i" is where they are already looking. */}
                  <th className="px-4 py-2.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      Stipend
                      <InfoDot label="How stipend eligibility is decided">
                        <p className="font-extrabold">Stipend eligibility</p>
                        <p className="mt-1 font-semibold">
                          An ambassador qualifies {period.noun} with{" "}
                          {STIPEND_MIN_COMPLETION_PCT}% of their tasks approved
                          and {STIPEND_MIN_INSTALLS} counted installs. Both are
                          needed — one without the other is not a qualifying
                          month.
                        </p>
                      </InfoDot>
                    </span>
                  </th>
                  <th className="w-52 px-4 py-2.5 text-right font-medium">
                    Completion
                  </th>
                </tr>
              </thead>

              <InfiniteTableBody
                key={`${period.key}:${cohort.filters.city}:${cohort.filters.college}:${cohort.filters.batch}`}
                colSpan={9}
                pageSize={15}
              >
                {ranked.map((ambassador, index) => (
                  <tr key={ambassador.id} className="hover:bg-canvas-sunk/50">
                    <td className="px-4 py-3 text-center text-[13px] font-extrabold text-ink-faint tabular">
                      {index + 1}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-extrabold text-ink"
                        >
                          {initials(ambassador.full_name)}
                        </span>
                        <Link
                          href={`/admin/ambassadors/${ambassador.id}`}
                          className="truncate text-[13.5px] font-extrabold text-ink hover:underline"
                        >
                          {ambassador.full_name}
                        </Link>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-[12.5px] text-ink-soft">
                      {ambassador.batch || "—"}
                    </td>

                    {/* The ambassador's own pool, not the programme's. Two
                        rows can legitimately show different totals — that is
                        the column saying one of them joined after a campaign
                        had already closed. */}
                    <td className="tabular px-4 py-3 text-right text-[13px] text-ink-soft">
                      {formatNumber(ambassador.total)}
                    </td>

                    <td className="tabular px-4 py-3 text-right text-[13px] font-bold text-ink">
                      {formatNumber(ambassador.approved)}
                    </td>

                    {/* A dash rather than a column of zeroes: the rejections
                        worth reading are the ones somebody has, and nought is
                        the answer for most of the table. */}
                    <td className="tabular px-4 py-3 text-right text-[13px] font-bold text-ink-soft">
                      {ambassador.rejected
                        ? formatNumber(ambassador.rejected)
                        : "—"}
                    </td>

                    {/* Counted installs from their referral code this period.
                        Bold once it clears the stipend bar, so the column can
                        be read down for who is there and who is short. */}
                    <td
                      className={`tabular px-4 py-3 text-right text-[13px] ${
                        ambassador.installs >= STIPEND_MIN_INSTALLS
                          ? "font-bold text-ink"
                          : "text-ink-soft"
                      }`}
                    >
                      {formatNumber(ambassador.installs)}
                    </td>

                    {/* Yes or no, and the gap when it is no. "Needs 7 more
                        installs" is something an admin can act on this week;
                        a bare "No" only says to go and work out why. */}
                    <td className="px-4 py-3 text-[12px]">
                      {ambassador.eligible ? (
                        <span className="font-extrabold text-brand">Eligible</span>
                      ) : (
                        <span className="font-bold text-ink-faint">
                          Needs{" "}
                          {[
                            ambassador.installsShort > 0
                              ? `${formatNumber(ambassador.installsShort)} more ${ambassador.installsShort === 1 ? "install" : "installs"}`
                              : null,
                            ambassador.completion < STIPEND_MIN_COMPLETION_PCT
                              ? `${STIPEND_MIN_COMPLETION_PCT}% completion`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" and ")}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {/* The bar carries the comparison, the numbers carry the
                          values — reading a column of percentages for the gap
                          between 30% and 20% is work a length does for free.
                          One track, scaled to every task the ambassador has,
                          filled left to right with approved, then sent back;
                          whatever stays empty is still pending. The three
                          figures under it are the same shares in the same
                          order, and they add to 100 by construction — see
                          `percentages` above. The bar is given the shares
                          rather than the counts so that it cannot round
                          differently from the figures. */}
                      <div className="ml-auto flex w-40 flex-col gap-1.5">
                        {/* No campaign was open to this person in the period,
                            so there is no share to draw. A 0% bar here would
                            be a judgement, and the one thing the row can say
                            for certain is that nobody asked them for
                            anything. */}
                        {ambassador.total === 0 ? (
                          <p className="py-1 text-right text-[11.5px] font-bold text-ink-faint">
                            No tasks open to them {period.noun}
                          </p>
                        ) : (
                          <>
                          <StackedBar
                            max={100}
                            segments={[
                              { value: ambassador.completion, tone: "brand" },
                              { value: ambassador.rejection, tone: "bad" },
                            ]}
                            label={`${formatNumber(ambassador.approved)} approved, ${formatNumber(ambassador.sentBack)} rejected and ${formatNumber(ambassador.pending)} pending, of ${formatNumber(ambassador.total)} tasks`}
                            className="h-2 w-full"
                          />
                          <ul className="tabular flex items-center justify-between text-[11.5px] font-extrabold text-ink">
                            <li className="flex items-center gap-1">
                              <span aria-hidden className="size-1.5 rounded-full bg-brand" />
                              <span className="sr-only">Approved </span>
                              {ambassador.completion}%
                            </li>
                            <li className="flex items-center gap-1">
                              <span aria-hidden className="size-1.5 rounded-full bg-bad" />
                              <span className="sr-only">Rejected </span>
                              {ambassador.rejection}%
                            </li>
                            <li className="flex items-center gap-1 text-ink-faint">
                              <span
                                aria-hidden
                                className="size-1.5 rounded-full border border-gray-300 bg-surface"
                              />
                              <span className="sr-only">Pending </span>
                              {ambassador.remainder}%
                            </li>
                          </ul>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </InfiniteTableBody>
            </table>
          </div>
        )}
      </Card>
        </>
      )}
    </div>
  );
}
