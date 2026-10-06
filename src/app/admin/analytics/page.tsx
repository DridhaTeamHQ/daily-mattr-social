import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  LayoutGrid,
  Layers,
  ListChecks,
  Users,
} from "lucide-react";

import { ChartCard } from "@/components/charts";
import { CompletionRing, RankMark } from "@/components/list-card";
import { CohortFilter } from "@/components/cohort-filter";
import { InfiniteTableBody } from "@/components/infinite-scroll";
import { PeriodFilter } from "@/components/period-filter";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { InfoDot } from "@/components/ui/info-dot";
import { Stat } from "@/components/ui/stat";
import { requireAdmin } from "@/lib/admin/queries";
import { readPeriod, resolvePeriod } from "@/lib/admin/period";
import {
  DIMENSIONS,
  cohortLabel,
  getCohort,
  readCohortFilters,
  type Dimension,
} from "@/lib/admin/scope";
import { createCachedClient as createClient } from "@/lib/admin/cached-client";
import {
  STIPEND_MIN_COMPLETION_PCT,
  STIPEND_MIN_DOWNLOADS,
  getCompletionByAmbassador,
} from "@/lib/admin/completion";
import { cn, formatNumber } from "@/lib/utils";

import { BatchAnalytics, getBatchStatusCounts } from "./batch-view";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<
    Partial<Record<Dimension | "period" | "view" | "focus", string | string[]>>
  >;
}) {
  await requireAdmin();

  const params = await searchParams;
  const filters = readCohortFilters(params);
  const periodKey = readPeriod(params.period);
  const period = resolvePeriod(periodKey);

  // Two views of the same figures. "batches" compares every batch side by
  // side and opens one at a time on its own tab, so its batch comes from those
  // tabs (`focus`) rather than from the batch dropdown — the cohort it groups
  // has to span every batch, or there would be nothing to compare.
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const view = first(params.view) === "batches" ? "batches" : "overview";
  const rawFocus = first(params.focus)?.trim();
  const focus = rawFocus ? cohortLabel("batch", rawFocus) : null;
  const cohort = await getCohort(
    filters.city,
    filters.college,
    view === "batches" ? null : filters.batch,
  );

  const supabase = await createClient();

  // Every figure on this page, and the CSV behind Download ambassadors, comes
  // out of one function — see `src/lib/admin/completion.ts` for why.
  const [completion, batchStatuses] = await Promise.all([
    getCompletionByAmbassador(supabase, { cohort, period }),
    view === "batches"
      ? getBatchStatusCounts(supabase, cohort.filters)
      : Promise.resolve(new Map()),
  ]);
  const {
    ranked,
    taskTotal,
    activeCampaigns,
    availableAssignments,
    completedTasks,
    completionPct,
    approvalPct,
    approvedSubmissions,
    pendingReview,
  } = completion;
  // Every task in the window, not the top eight the bar chart used to show.
  const allTasks = completion.campaignBreakdown(null);

  /** This page with the view and batch swapped, everything else kept. */
  const viewHref = (next: "overview" | "batches", batch: string | null) => {
    const query = new URLSearchParams();
    if (cohort.filters.city) query.set("city", cohort.filters.city);
    if (cohort.filters.college) query.set("college", cohort.filters.college);
    if (next === "batches") {
      query.set("view", "batches");
      if (batch) query.set("focus", batch);
    } else if (batch) {
      query.set("batch", batch);
    }
    if (params.period) query.set("period", periodKey);
    const text = query.toString();
    return `/admin/analytics${text ? `?${text}` : ""}`;
  };

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
  if (view === "batches" && focus) exportParams.set("batch", focus);
  exportParams.set("period", periodKey);
  const exportQuery = exportParams.toString();
  const exportHref = `/admin/analytics/export${exportQuery ? `?${exportQuery}` : ""}`;

  return (
    <div className="stagger space-y-5">
      {/* Title on the left, the two page actions pinned top-right beside it
          rather than wrapping onto a row of their own under the blurb. */}
      <div className="flex flex-wrap items-start justify-between gap-4 md:flex-nowrap">
        <div className="min-w-0">
          <h1 className="display text-[26px] leading-none text-ink">Analytics</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Tasks done or missed since each ambassador joined, across{" "}
            {cohort.active
              ? `${formatNumber(cohort.matched)} of ${formatNumber(cohort.total)} active ambassadors.`
              : "active ambassadors."}{" "}
            Review and approval rates are {period.noun}.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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

      {/* Overview and Batches as tabs: two different questions about the
          same ambassadors, kept on separate screens so neither is read
          against the other's numbers. Switching carries the batch across —
          the dropdown on one becomes the open tab on the other. */}
      <nav
        aria-label="Analytics views"
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-gray-200 pb-px"
      >
        {(
          [
            { key: "overview", label: "Overview", icon: LayoutGrid, href: viewHref("overview", focus) },
            { key: "batches", label: "Batches", icon: Layers, href: viewHref("batches", filters.batch) },
          ] as const
        ).map((tab) => {
          const active = tab.key === view;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3.5 py-2.5 text-[13.5px] font-bold transition-colors",
                active
                  ? "border-brand text-brand"
                  : "border-transparent text-ink-soft hover:text-ink",
              )}
            >
              <tab.icon className="size-4" aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* The page's one control bar. Given its own surface so it reads as
          something that governs everything below it, rather than as chrome
          belonging to the tiles it happens to sit above. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-surface p-3 shadow-xs">
        <PeriodFilter period={period.key} />
        <CohortFilter
          cohort={cohort}
          hide={view === "batches" ? ["batch"] : []}
        />
      </div>

      {cohort.empty ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Nobody matches that filter"
            description="No active ambassador is in every one of the selected city, college/office and batch. Clear one of them to widen the view."
          />
        </Card>
      ) : view === "batches" ? (
        <BatchAnalytics
          data={completion}
          statuses={batchStatuses}
          focus={focus}
          period={period}
          hrefFor={(batch) => viewHref("batches", batch)}
        />
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
          label="Tasks published"
          value={taskTotal}
          sub={`Across ${activeCampaigns.length} campaign${activeCampaigns.length === 1 ? "" : "s"}`}
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
            title="No tasks published yet"
            description="Publish a campaign task to start tracking completion percentages."
          />
        </Card>
      ) : (
        // Every task, two to a row, each with its ring — the same mark the
        // campaign cards carry, so a task reads the same on both pages. The
        // colour is the verdict: green from 70%, amber from 40%, red below.
        <ChartCard
          title="Task completion"
          hint="Approved tasks over the tasks open to ambassadors who joined before each one closed. Open a task for who has done it and who has not."
        >
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {allTasks.map((task) => (
              <li key={task.id} className="border-b border-line">
                <Link
                  href={task.href}
                  className="group flex items-center gap-3 py-2.5"
                >
                  <CompletionRing
                    done={task.approved}
                    of={task.total}
                    title={`${task.approved} of ${task.total} approved`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-ink group-hover:underline">
                      {task.label}
                    </p>
                    <p className="tabular text-[12px] text-ink-soft">
                      {formatNumber(task.approved)}/{formatNumber(task.total)} approved
                    </p>
                  </div>
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-ink-faint group-hover:text-ink"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </ChartCard>
      )}

      <Card className="overflow-hidden">
        <CardBody className="pb-4">
          <h2 className="display text-[16px] text-ink">Completion by ambassador</h2>
          {/* No second filter row here. One set of controls, at the top of
              the page, scoping everything on it. This line names the slice
              those controls have selected. */}
          <p className="mt-1 text-[12.5px] text-ink-soft">
            {formatNumber(ranked.length)}{" "}
            {ranked.length === 1 ? "ambassador" : "ambassadors"} ·{" "}
            {scopeSummary}
          </p>
        </CardBody>

        {ranked.length === 0 ? (
          <CardBody>
            <EmptyState title="No active ambassadors" />
          </CardBody>
        ) : (
          // Compact, and in the order an admin reads a row: how far along,
          // how much, what was sent back, downloads — and last, whether that
          // adds up to a stipend. The same table the Batches tab draws.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left">
              <thead className="border-y border-line bg-canvas-sunk">
                <tr className="text-[11px] tracking-wide text-ink-faint uppercase">
                  <th className="w-12 px-3 py-2 text-center font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Ambassador</th>
                  <th className="px-3 py-2 font-medium">Batch</th>
                  <th className="px-3 py-2 text-right font-medium">Completion</th>
                  <th className="px-3 py-2 text-right font-medium">Tasks</th>
                  <th className="px-3 py-2 text-right font-medium">Rejections</th>
                  <th className="px-3 py-2 text-right font-medium">Downloads</th>
                  {/* The rule lives on the column it governs: "Eligible" and
                      "Needs 4 more downloads" are the cells anyone has to
                      interpret, and the "i" is where they are looking. */}
                  <th className="px-3 py-2 font-medium">
                    <span className="flex items-center gap-1.5">
                      Stipend
                      <InfoDot label="How stipend eligibility is decided">
                        <p className="font-extrabold">Stipend eligibility</p>
                        <p className="mt-1 font-semibold">
                          An ambassador qualifies with{" "}
                          {STIPEND_MIN_COMPLETION_PCT}% of the tasks they could
                          reach since joining approved, and{" "}
                          {STIPEND_MIN_DOWNLOADS} counted downloads against
                          their code. Both are needed — one without the other
                          is not a qualifying month.
                        </p>
                      </InfoDot>
                    </span>
                  </th>
                </tr>
              </thead>

              <InfiniteTableBody
                key={`${period.key}:${cohort.filters.city}:${cohort.filters.college}:${cohort.filters.batch}`}
                colSpan={8}
                pageSize={25}
              >
                {ranked.map((ambassador, index) => {
                  const measured = ambassador.total > 0;
                  return (
                    <tr
                      key={ambassador.id}
                      className="border-b border-line last:border-0 hover:bg-canvas-sunk/50"
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex justify-center">
                          <RankMark rank={measured ? index + 1 : null} />
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/admin/ambassadors/${ambassador.id}`}
                          className="block truncate text-[13px] font-extrabold text-ink hover:underline"
                        >
                          {ambassador.full_name}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">
                        {ambassador.batch || "—"}
                      </td>
                      {/* Coloured by the same thresholds as the rings above,
                          so a red figure here means the same as a red ring. */}
                      <td
                        className={cn(
                          "tabular px-3 py-1.5 text-right text-[13px] font-extrabold",
                          !measured
                            ? "text-ink-faint"
                            : ambassador.completion >= 70
                              ? "text-emerald-600"
                              : ambassador.completion >= 40
                                ? "text-amber-600"
                                : "text-rose-600",
                        )}
                      >
                        {measured ? `${ambassador.completion}%` : "—"}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right text-[13px] text-ink-soft">
                        {measured
                          ? `${formatNumber(ambassador.approved)}/${formatNumber(ambassador.total)}`
                          : "—"}
                      </td>
                      {/* A dash rather than a column of zeroes: the
                          rejections worth reading are the ones somebody has. */}
                      <td className="tabular px-3 py-1.5 text-right text-[13px] text-ink-soft">
                        {ambassador.rejected ? formatNumber(ambassador.rejected) : "—"}
                      </td>
                      {/* Bold once it clears the stipend bar, so the column
                          can be read down for who is there and who is short. */}
                      <td
                        className={cn(
                          "tabular px-3 py-1.5 text-right text-[13px]",
                          ambassador.downloads >= STIPEND_MIN_DOWNLOADS
                            ? "font-bold text-ink"
                            : "text-ink-soft",
                        )}
                      >
                        {formatNumber(ambassador.downloads)}
                      </td>
                      {/* Yes or no, and the gap when it is no — "Needs 7 more
                          downloads" is something an admin can act on. */}
                      <td className="px-3 py-1.5 text-[12px]">
                        {ambassador.eligible ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-extrabold text-emerald-700">
                            Eligible
                          </span>
                        ) : (
                          <span className="font-semibold text-ink-faint">
                            Needs{" "}
                            {[
                              ambassador.downloadsShort > 0
                                ? `${formatNumber(ambassador.downloadsShort)} more ${ambassador.downloadsShort === 1 ? "download" : "downloads"}`
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
                    </tr>
                  );
                })}
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
