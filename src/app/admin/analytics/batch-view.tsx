import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight, Layers, Users } from "lucide-react";

import { ChartCard, Heatmap } from "@/components/charts";
import { InfiniteTableBody } from "@/components/infinite-scroll";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { RankMark } from "@/components/list-card";
import { StackedBar } from "@/components/ui/stat";
import {
  STIPEND_MIN_COMPLETION_PCT,
  type getCompletionByAmbassador,
} from "@/lib/admin/completion";
import type { Period } from "@/lib/admin/period";
import { readAll } from "@/lib/admin/read-all";
import {
  UNASSIGNED,
  cohortLabel,
  type CohortFilters,
} from "@/lib/admin/scope";
import { cn, formatNumber } from "@/lib/utils";

/**
 * The batch view of /admin/analytics.
 *
 * Every number here is cut from the same `getCompletionByAmbassador` result
 * the overview renders — the rows are grouped by batch afterwards, and the
 * per-task figures come from its own `campaignBreakdown`. So a batch's figures
 * are the overview's figures for that batch, by construction rather than by a
 * second query agreeing with the first.
 *
 * One selector, two screens: "All batches" ranks the batches against each
 * other, and picking one shows that batch alone. Nothing from one batch is on
 * screen next to another's except on the comparison, where that is the point.
 */

type Completion = Awaited<ReturnType<typeof getCompletionByAmbassador>>;

/** Every ambassador account in a batch, by account status. */
export type StatusCounts = { active: number; inactive: number; suspended: number };

/**
 * Ambassador accounts per batch, whatever their status.
 *
 * The rest of this view is about active ambassadors only — the completion
 * figures come from `getCompletionByAmbassador`, which never reads anybody
 * else — so the head count has to be read separately. "Inactive" is an
 * account still `invited`: added by an admin, invite not yet accepted.
 * Narrowed by the same city and college the page is, so the counts are about
 * the same people as the figures beside them.
 */
export async function getBatchStatusCounts(
  supabase: SupabaseClient,
  filters: CohortFilters,
): Promise<Map<string, StatusCounts>> {
  const rows = await readAll<{
    status: string;
    city: string | null;
    college: string | null;
    batch: string | null;
  }>(
    (from, to) =>
      supabase
        .from("profiles")
        .select("status, city, college, batch")
        .eq("role", "ambassador")
        .order("id")
        .range(from, to),
    "analytics.batchStatus",
  );

  const counts = new Map<string, StatusCounts>();
  for (const row of rows) {
    if (filters.city && cohortLabel("city", row.city ?? "") !== filters.city) continue;
    if (filters.college && cohortLabel("college", row.college ?? "") !== filters.college) continue;
    const batch = cohortLabel("batch", row.batch ?? "");
    const entry = counts.get(batch) ?? { active: 0, inactive: 0, suspended: 0 };
    if (row.status === "active") entry.active += 1;
    else if (row.status === "suspended") entry.suspended += 1;
    else entry.inactive += 1;
    counts.set(batch, entry);
  }
  return counts;
}
type Ambassador = Completion["ranked"][number];

/**
 * Ambassadors grouped by how much of their work is done, best first.
 *
 * Each row says what it counts in full — "60–79% tasks done" — rather than
 * a nickname like "Close" that the reader has to translate back into a
 * range. The top band starts at the stipend bar, and says so.
 */
const BANDS = [
  { label: `${STIPEND_MIN_COMPLETION_PCT}% or more tasks done`, note: "Meets stipend bar", min: STIPEND_MIN_COMPLETION_PCT, max: 100, color: "#16a34a" },
  { label: `60–${STIPEND_MIN_COMPLETION_PCT - 1}% tasks done`, note: null, min: 60, max: STIPEND_MIN_COMPLETION_PCT - 1, color: "#65a30d" },
  { label: "40–59% tasks done", note: null, min: 40, max: 59, color: "#d97706" },
  { label: "20–39% tasks done", note: null, min: 20, max: 39, color: "#ea580c" },
  { label: "Less than 20% tasks done", note: null, min: 0, max: 19, color: "#dc2626" },
] as const;

type BatchSummary = {
  label: string;
  members: Ambassador[];
  ids: Set<string>;
  ambassadors: number;
  total: number;
  approved: number;
  completion: number;
  eligible: number;
  downloads: number;
  /** Ambassadors with at least one task approved. */
  active: number;
  /** Null for "Unassigned", which is not a batch and is not ranked. */
  rank: number | null;
};

const byName = (left: { label: string }, right: { label: string }) =>
  left.label.localeCompare(right.label, undefined, { numeric: true });

function summarise(label: string, members: Ambassador[]): Omit<BatchSummary, "rank"> {
  const total = members.reduce((sum, row) => sum + row.total, 0);
  const approved = members.reduce((sum, row) => sum + row.approved, 0);
  return {
    label,
    members,
    ids: new Set(members.map((row) => row.id)),
    ambassadors: members.length,
    total,
    approved,
    completion: total ? Math.round((approved * 100) / total) : 0,
    eligible: members.filter((row) => row.eligible).length,
    downloads: members.reduce((sum, row) => sum + row.downloads, 0),
    active: members.filter((row) => row.approved > 0).length,
  };
}

export function BatchAnalytics({
  data,
  statuses,
  focus,
  period,
  hrefFor,
}: {
  data: Completion;
  statuses: Map<string, StatusCounts>;
  /** The batch that is open, or null for "All batches". */
  focus: string | null;
  period: Period;
  /** A link to this view with a different batch open. */
  hrefFor: (batch: string | null) => string;
}) {
  // `ranked` is already in ranking order, so grouping it keeps each batch's
  // members ranked too.
  const groups = new Map<string, Ambassador[]>();
  for (const row of data.ranked) {
    const label = cohortLabel("batch", row.batch ?? "");
    const list = groups.get(label) ?? [];
    list.push(row);
    groups.set(label, list);
  }

  // Ranked by completion, then by approvals so a tie goes to the batch that
  // did more work, then by name so the order is stable between reloads.
  // "Unassigned" is people nobody has put in a batch yet — it goes last and
  // carries no rank, or it would read as the worst batch.
  const summaries = [...groups.entries()].map(([label, members]) =>
    summarise(label, members),
  );
  let rank = 0;
  const batches: BatchSummary[] = [
    ...summaries
      .filter((batch) => batch.label !== UNASSIGNED)
      .sort(
        (left, right) =>
          right.completion - left.completion ||
          right.approved - left.approved ||
          byName(left, right),
      )
      .map((batch) => ({ ...batch, rank: ++rank })),
    ...summaries
      .filter((batch) => batch.label === UNASSIGNED)
      .map((batch) => ({ ...batch, rank: null })),
  ];
  const ranked = batches.filter((batch) => batch.rank !== null);

  if (batches.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Layers}
          title="No batches to compare"
          description="No active ambassador matches the filters above."
        />
      </Card>
    );
  }

  const selected = focus ? batches.find((batch) => batch.label === focus) : null;

  return (
    <div className="space-y-5">
      {/* The batch selector — the same segmented control as Day / Week /
          Month, so it reads as "pick one" rather than as another nav bar. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <nav
          aria-label="Batch"
          className="inline-flex h-11 items-center gap-0.5 rounded-xl border border-gray-200 bg-surface p-1 shadow-xs"
        >
          <Segment href={hrefFor(null)} active={!focus}>
            All batches
          </Segment>
          {[...batches].sort(byName).map((batch) => (
            <Segment
              key={batch.label}
              href={hrefFor(batch.label)}
              active={focus === batch.label}
            >
              {batch.label}
            </Segment>
          ))}
        </nav>
      </div>

      {focus && !selected ? (
        <Card>
          <EmptyState
            icon={Users}
            title={`Nobody in ${focus}`}
            description="No active ambassador in this batch matches the city and college above."
          />
        </Card>
      ) : selected ? (
        <BatchDetail
          batch={selected}
          batchCount={ranked.length}
          statuses={
            statuses.get(selected.label) ?? {
              active: selected.ambassadors,
              inactive: 0,
              suspended: 0,
            }
          }
          data={data}
          period={period}
        />
      ) : (
        <BatchComparison batches={batches} data={data} hrefFor={hrefFor} />
      )}
    </div>
  );
}

function Segment({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-full shrink-0 items-center rounded-lg px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors",
        active ? "bg-ink text-white" : "text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}


/** A plain progress track, the one the ambassador table already uses. */
function Meter({ value, label }: { value: number; label: string }) {
  return (
    <StackedBar
      max={100}
      segments={[{ value, tone: "brand" }]}
      label={label}
      className="h-2.5 flex-1"
    />
  );
}

/* ------------------------------------------------------------------------ */
/* All batches                                                               */
/* ------------------------------------------------------------------------ */

function BatchComparison({
  batches,
  data,
  hrefFor,
}: {
  batches: BatchSummary[];
  data: Completion;
  hrefFor: (batch: string | null) => string;
}) {
  const ranked = batches.filter((batch) => batch.rank !== null);
  const columns = [...ranked].sort(byName);

  // Task × batch, real batches only. Rows in the programme-wide order, so the
  // weakest tasks sit at the bottom whichever batch you read across, and a
  // task nobody in any batch could reach is left out rather than drawn as a
  // row of dashes.
  const perBatch = columns.map(
    (batch) =>
      new Map(data.campaignBreakdown(batch.ids).map((row) => [row.id, row])),
  );
  const taskRows = data
    .campaignBreakdown(null)
    .map((campaign) => ({
      id: campaign.id,
      label: campaign.label,
      href: campaign.href,
      cells: perBatch.map((byCampaign) => {
        const cell = byCampaign.get(campaign.id);
        return cell && cell.total > 0 ? { value: cell.value, sub: cell.sub } : null;
      }),
    }))
    .filter((row) => row.cells.some(Boolean));

  return (
    <div className="space-y-5">
      {/* One ranked list carries the whole comparison: the bar is the
          completion, and the two figures beside it are the only other things
          worth comparing a batch on. Each row opens that batch. */}
      <ChartCard
        title="Batch ranking"
        hint="Ranked by completion — approved tasks over the tasks each batch could reach. Open a batch to see its tasks and ambassadors."
      >
        <ul className="divide-y divide-line">
          {batches.map((batch) => (
            <li key={batch.label}>
              <Link
                href={hrefFor(batch.label)}
                scroll={false}
                className="group grid grid-cols-[auto_minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[auto_minmax(0,10rem)_minmax(0,1fr)_auto_auto]"
              >
                <RankMark rank={batch.rank} />
                <div className="min-w-0">
                  <p
                    className={cn(
                      "truncate text-[14px] font-extrabold group-hover:underline",
                      batch.rank === null ? "text-ink-soft" : "text-ink",
                    )}
                  >
                    {batch.label}
                  </p>
                  <p className="text-[12px] font-semibold text-ink-faint">
                    {formatNumber(batch.ambassadors)}{" "}
                    {batch.ambassadors === 1 ? "ambassador" : "ambassadors"}
                  </p>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <Meter
                    value={batch.completion}
                    label={`${batch.label}: ${batch.completion}% complete`}
                  />
                  <span className="tabular w-11 text-right text-[14px] font-extrabold text-ink">
                    {batch.completion}%
                  </span>
                </div>
                <dl className="col-span-3 col-start-2 flex gap-5 text-[12px] sm:col-span-1 sm:col-start-auto">
                  <div>
                    <dt className="font-semibold text-ink-faint">Eligible</dt>
                    <dd className="tabular font-extrabold text-ink">
                      {formatNumber(batch.eligible)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-faint">Downloads</dt>
                    <dd className="tabular font-extrabold text-ink">
                      {formatNumber(batch.downloads)}
                    </dd>
                  </div>
                </dl>
                <ChevronRight
                  aria-hidden
                  className="hidden size-4 text-ink-faint group-hover:text-ink sm:block"
                />
              </Link>
            </li>
          ))}
        </ul>
      </ChartCard>

      {columns.length > 1 && taskRows.length > 0 && (
        <ChartCard
          title="Tasks by batch"
          hint="Read across a row to see which batch is behind on a task. Darker is more complete; a dash means that batch could not reach the task."
        >
          <Heatmap
            rowHeader="Task"
            columns={columns.map((batch) => ({
              id: batch.label,
              label: batch.label,
              href: hrefFor(batch.label),
            }))}
            rows={taskRows}
          />
        </ChartCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* One batch                                                                 */
/* ------------------------------------------------------------------------ */

function BatchDetail({
  batch,
  batchCount,
  statuses,
  data,
  period,
}: {
  batch: BatchSummary;
  batchCount: number;
  statuses: StatusCounts;
  data: Completion;
  period: Period;
}) {
  const tasks = data.campaignBreakdown(batch.ids).filter((task) => task.total > 0);
  const measured = batch.members.filter((row) => row.total > 0);
  const spread = BANDS.map((band) => {
    const count = measured.filter(
      (row) => row.completion >= band.min && row.completion <= band.max,
    ).length;
    return {
      ...band,
      count,
      share: measured.length ? Math.round((count * 100) / measured.length) : 0,
    };
  });

  const figures = [
    {
      label: "Completion",
      value: `${batch.completion}%`,
      sub: `${formatNumber(batch.approved)}/${formatNumber(batch.total)} tasks`,
    },
    {
      label: "Ambassadors",
      value: formatNumber(
        statuses.active + statuses.inactive + statuses.suspended,
      ),
      sub: (
        <span className="flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-1.5 rounded-full bg-green-600" />
            {formatNumber(statuses.active)} active
          </span>
          <span
            className="inline-flex items-center gap-1"
            title="Invited, but has not accepted the invite yet"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
            {formatNumber(statuses.inactive)} inactive
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-1.5 rounded-full bg-red-600" />
            {formatNumber(statuses.suspended)} suspended
          </span>
        </span>
      ),
    },
    {
      label: "Stipend eligible",
      value: formatNumber(batch.eligible),
      sub: `of ${formatNumber(batch.ambassadors)}`,
    },
    {
      label: "Downloads",
      value: formatNumber(batch.downloads),
      sub: null,
    },
  ];

  return (
    <div className="space-y-5">
      {/* The batch's headline numbers on one strip, with its place among the
          batches up front — four separate tiles would repeat the overview's
          look and make this read as the overview again. */}
      <section className="rounded-2xl border border-gray-200 bg-surface shadow-xs">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <RankMark rank={batch.rank} />
          <div>
            <h2 className="display text-[18px] leading-none text-ink">{batch.label}</h2>
            <p className="mt-1 text-[12.5px] text-ink-soft">
              {batch.rank === null
                ? "Ambassadors without a batch — not ranked"
                : `Rank ${batch.rank} of ${batchCount} ${batchCount === 1 ? "batch" : "batches"}`}{" "}
              · {period.noun}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
          {figures.map((figure) => (
            <div key={figure.label} className="px-5 py-4">
              <dt className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
                {figure.label}
              </dt>
              <dd className="mt-1 text-[24px] leading-none font-extrabold text-ink">
                {figure.value}
              </dd>
              {figure.sub && (
                <dd className="mt-1 text-[12px] font-semibold text-ink-soft">
                  {figure.sub}
                </dd>
              )}
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="Tasks"
          hint="Completion of each task inside this batch, highest first."
        >
          {tasks.length === 0 ? (
            <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
              No task was open to this batch.
            </p>
          ) : (
            <ul className="max-h-[22rem] space-y-2.5 overflow-y-auto pr-1">
              {tasks.map((task) => (
                <li key={task.id}>
                  <Link href={task.href} className="group block">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13px] font-bold text-ink group-hover:underline">
                        {task.label}
                      </span>
                      <span className="tabular shrink-0 text-[12.5px] font-extrabold text-ink">
                        {task.value}%
                        <span className="ml-1.5 font-semibold text-ink-faint">
                          {formatNumber(task.approved)}/{formatNumber(task.total)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 flex">
                      <Meter
                        value={task.value}
                        label={`${task.label}: ${task.value}%`}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="Ambassadors by tasks done"
          hint={`The ${formatNumber(measured.length)} ambassadors in ${batch.label}, grouped by how many of their tasks are approved.`}
        >
          {measured.length === 0 ? (
            <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
              Nobody in this batch has had a task yet.
            </p>
          ) : (
            <>
              {/* The whole batch on one bar first, so the split reads at a
                  glance before the rows give the detail. */}
              <div
                role="img"
                aria-label={spread
                  .map((band) => `${band.label}: ${band.count}`)
                  .join(", ")}
                className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100"
              >
                {spread.map((band) =>
                  band.count > 0 ? (
                    <div
                      key={band.label}
                      title={`${band.label}: ${band.count}`}
                      style={{
                        width: `${(band.count * 100) / measured.length}%`,
                        backgroundColor: band.color,
                      }}
                    />
                  ) : null,
                )}
              </div>

              <ul className="mt-4 space-y-3">
                {spread.map((band) => (
                  <li key={band.label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: band.color }}
                        />
                        {band.label}
                        {band.note && (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10.5px] font-bold text-green-700">
                            {band.note}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "tabular shrink-0 text-[12.5px] font-extrabold",
                          band.count ? "text-ink" : "text-ink-faint",
                        )}
                      >
                        {formatNumber(band.count)}{" "}
                        {band.count === 1 ? "ambassador" : "ambassadors"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${band.share}%`,
                            backgroundColor: band.color,
                          }}
                        />
                      </div>
                      <span className="tabular w-9 text-right text-[11.5px] font-bold text-ink-soft">
                        {band.share}%
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartCard>
      </div>

      <Card className="overflow-hidden">
        <CardBody className="pb-4">
          <h2 className="display text-[16px] text-ink">Ambassadors</h2>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            Ranked by completion inside {batch.label}.
          </p>
        </CardBody>
        <div className="overflow-x-auto">
          {/* Compact on purpose: this is a list to scan down, and the figures
              say everything a bar would. Read left to right in the order an
              admin asks — how far along, how much, how many downloads, and
              finally whether that adds up to a stipend. */}
          <table className="w-full min-w-[36rem] text-left">
            <thead className="border-y border-line bg-canvas-sunk">
              <tr className="text-[11px] tracking-wide text-ink-faint uppercase">
                <th className="w-12 px-3 py-2 text-center font-medium">#</th>
                <th className="px-3 py-2 font-medium">Ambassador</th>
                <th className="px-3 py-2 text-right font-medium">Completion</th>
                <th className="px-3 py-2 text-right font-medium">Tasks</th>
                <th className="px-3 py-2 text-right font-medium">Downloads</th>
                <th className="px-3 py-2 font-medium">Stipend</th>
              </tr>
            </thead>
            <InfiniteTableBody key={batch.label} colSpan={6} pageSize={25}>
              {batch.members.map((row, index) => (
                <tr
                  key={row.id}
                  className="border-b border-line last:border-0 hover:bg-canvas-sunk/50"
                >
                  <td className="px-3 py-1.5">
                    <div className="flex justify-center">
                      <RankMark rank={row.total > 0 ? index + 1 : null} />
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/admin/ambassadors/${row.id}`}
                      className="block truncate text-[13px] font-extrabold text-ink hover:underline"
                    >
                      {row.full_name}
                    </Link>
                  </td>
                  <td className="tabular px-3 py-1.5 text-right text-[13px] font-extrabold text-ink">
                    {row.total > 0 ? `${row.completion}%` : "—"}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right text-[13px] text-ink-soft">
                    {row.total > 0
                      ? `${formatNumber(row.approved)}/${formatNumber(row.total)}`
                      : "—"}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right text-[13px] text-ink-soft">
                    {formatNumber(row.downloads)}
                  </td>
                  <td className="px-3 py-1.5 text-[12px]">
                    {row.eligible ? (
                      <span className="font-extrabold text-brand">Eligible</span>
                    ) : (
                      <span className="font-bold text-ink-faint">Not yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </InfiniteTableBody>
          </table>
        </div>
      </Card>
    </div>
  );
}
