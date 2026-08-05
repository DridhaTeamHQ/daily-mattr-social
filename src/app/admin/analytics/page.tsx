import { Coins, Percent, TrendingUp, Wallet } from "lucide-react";

import {
  BarList,
  ChartCard,
  DataTable,
  DayBars,
  SERIES,
} from "@/components/charts";
import { FilterChips, type ChipOption } from "@/components/filter-chips";
import { GoalTracker } from "@/components/goal-tracker";
import { Card, CardBody } from "@/components/ui/card";
import { Note } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { getAnalytics, requireAdmin } from "@/lib/admin/queries";
import { getMoneySummary } from "@/lib/admin/money";
import { getGeography, getGoalTracking } from "@/lib/admin/growth";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Analytics" };

/**
 * Status colours are reserved and never reused as series colours, so the
 * submissions chart maps each state to its own meaning rather than to a
 * position in the categorical order.
 */
const STATUS_FILL: Record<string, string> = {
  "Auto-approved": "#00a650",
  Approved: "#00a650",
  "Needs review": "#b06a00",
  Checking: "#8a8a8a",
  Rejected: "#e00b0b",
  Revoked: "#e00b0b",
};

/**
 * One time window for the whole page.
 *
 * Every figure below moves together. A page where each card silently covered a
 * different period is how somebody reads two numbers side by side and draws a
 * conclusion neither of them supports.
 */
const PERIODS = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
] as const;

const DIMENSIONS = [
  { key: "city", label: "City" },
  { key: "batch", label: "Batch" },
  { key: "college", label: "College" },
] as const;

type Dimension = (typeof DIMENSIONS)[number]["key"];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; by?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;

  const days = PERIODS.some((p) => p.key === params.days)
    ? Number(params.days)
    : 30;
  const by: Dimension = DIMENSIONS.some((d) => d.key === params.by)
    ? (params.by as Dimension)
    : "city";

  const [data, goal, geography, money] = await Promise.all([
    getAnalytics(days),
    getGoalTracking(days),
    getGeography(),
    getMoneySummary(),
  ]);

  const success =
    data.totals.approvalRate === null
      ? "—"
      : `${Math.round(data.totals.approvalRate * 100)}%`;

  const href = (next: Record<string, string>) => {
    const sp = new URLSearchParams({ days: String(days), by, ...next });
    return `/admin/analytics?${sp.toString()}`;
  };

  const periodChips: ChipOption[] = PERIODS.map((p) => ({
    key: p.key,
    label: p.label,
    href: href({ days: p.key }),
  }));

  const dimensionChips: ChipOption[] = DIMENSIONS.map((d) => ({
    key: d.key,
    label: d.label,
    href: href({ by: d.key }),
  }));

  const cohort =
    by === "batch"
      ? geography.batches
      : by === "college"
        ? geography.colleges
        : geography.cities;

  const windowLabel = `Last ${days} days`;

  return (
    <div className="stagger space-y-5">
      <div>
        <h1 className="display text-[26px] leading-none text-ink">Analytics</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          Everything below covers the same window.
        </p>
      </div>

      <FilterChips label="Period" options={periodChips} active={String(days)} />

      <GoalTracker goal={goal} />

      {/* ─── Money ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Stipend paid"
          value={`₹${formatNumber(money.stipendPaidInr)}`}
          sub="To date"
          icon={Coins}
          tone="brand"
        />
        <Stat
          label="Incentives"
          value={`₹${formatNumber(money.redemptionPaidInr)}`}
          sub="Points turned to cash"
          icon={Wallet}
          tone="rank"
        />
        <Stat
          label="To be paid"
          value={`₹${formatNumber(money.pendingInr)}`}
          sub={`${money.redemptionsOpen} request${money.redemptionsOpen === 1 ? "" : "s"} open`}
          icon={Wallet}
          tone="invite"
        />
        <Stat
          label="Success rate"
          value={success}
          sub="Of reviewed screenshots"
          icon={Percent}
          tone="poll"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Points issued"
          value={formatNumber(data.totals.issued)}
          sub={windowLabel}
          icon={Coins}
          tone="brand"
        />
        <Stat
          label="Points reversed"
          value={formatNumber(data.totals.reversed)}
          sub={data.totals.reversed > 0 ? "Revoked or corrected" : "None"}
          icon={TrendingUp}
          tone="reel"
        />
        <Stat
          label="Survey responses"
          value={formatNumber(
            data.responsesBySurvey.reduce((sum, row) => sum + row.value, 0),
          )}
          sub={windowLabel}
          icon={Coins}
          tone="poll"
        />
        <Stat
          label="Downloads"
          value={formatNumber(goal.total)}
          sub="All time"
          icon={TrendingUp}
          tone="rank"
        />
      </div>

      {/* ─── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Downloads per day" hint={windowLabel}>
          <DayBars data={goal.perDay} color="gold" />
          <DataTable
            caption="Downloads per day"
            rows={goal.perDay
              .filter((d) => d.value > 0)
              .map((d) => ({ label: d.day, value: d.value }))}
          />
        </ChartCard>

        <ChartCard title="Where installs come from" hint="Store split, all time.">
          <BarList data={goal.byStore} emptyMessage="No downloads recorded yet." />
          <DataTable caption="Store split" rows={goal.byStore} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Where points come from" hint={windowLabel}>
          <BarList
            data={data.earningsBySource}
            color="gold"
            emptyMessage="Nobody has earned anything in this window."
          />
          <DataTable caption="Points by source" rows={data.earningsBySource} />
        </ChartCard>

        <ChartCard title="Screenshot outcomes" hint={windowLabel}>
          <BarList
            data={data.submissionsByStatus.map((row) => ({
              ...row,
              color: STATUS_FILL[row.label],
            }))}
            emptyMessage="Nothing submitted in this window."
          />
          <DataTable caption="Outcomes" rows={data.submissionsByStatus} />
        </ChartCard>
      </div>

      {/* ─── Cohort ────────────────────────────────────────────────────────── */}
      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Breakdown</h2>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
            Downloads per head as well as the total — a group of thirty will
            always out-total a group of six.
          </p>

          {/* One card with a dimension filter, rather than three near-identical
              cards sitting side by side. */}
          <div className="mt-3">
            <FilterChips label="Group by" options={dimensionChips} active={by} />
          </div>

          {cohort.length === 0 ? (
            <p className="mt-4 text-[12.5px] font-semibold text-ink-soft">
              Nothing recorded yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {cohort.slice(0, 12).map((row) => (
                <li key={row.label} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink">
                      {row.label}
                    </p>
                    <p className="text-[11.5px] text-ink-soft">
                      {row.ambassadors} ambassador
                      {row.ambassadors === 1 ? "" : "s"} ·{" "}
                      {formatNumber(row.points)} points
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[14px] font-extrabold text-ink">
                      {formatNumber(row.downloads)}
                    </p>
                    <p className="text-[11px] text-ink-soft">{row.perHead} each</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Note tone="neutral">
        Series colours here are darker steps of the app&apos;s accents: the
        bright UI versions fail a contrast check as chart fills. The steps used
        were validated for colourblind separation, and every bar carries its own
        number so nothing depends on colour alone.
        <span aria-hidden className="mt-2 flex gap-1.5">
          {Object.values(SERIES).map((hex) => (
            <span
              key={hex}
              className="size-4 rounded-xs border-2 border-ink"
              style={{ backgroundColor: hex }}
            />
          ))}
        </span>
      </Note>
    </div>
  );
}
