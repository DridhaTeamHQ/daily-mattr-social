import { Coins, Percent, TrendingUp, Users } from "lucide-react";

import {
  BarList,
  ChartCard,
  DataTable,
  DayBars,
  SERIES,
} from "@/components/charts";
import { Note } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { Funnel, GoalTracker } from "@/components/goal-tracker";
import { Card, CardBody } from "@/components/ui/card";
import { getAnalytics, requireAdmin } from "@/lib/admin/queries";
import { getMoneySummary } from "@/lib/admin/money";
import {
  getFunnel,
  getGeography,
  getGoalTracking,
  getReviewOps,
} from "@/lib/admin/growth";
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

export default async function AnalyticsPage() {
  await requireAdmin();

  const [data, goal, funnel, geography, ops, money] = await Promise.all([
    getAnalytics(30),
    getGoalTracking(),
    getFunnel(),
    getGeography(),
    getReviewOps(),
    getMoneySummary(),
  ]);

  const approval =
    data.totals.approvalRate === null
      ? "—"
      : `${Math.round(data.totals.approvalRate * 100)}%`;

  return (
    <div className="stagger space-y-5">
      <div>
        <h1 className="display text-[26px] leading-none text-ink">Analytics</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          The last 30 days of the programme.
        </p>
      </div>

      <GoalTracker goal={goal} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Downloads per day"
          hint="Bars are raw daily counts over 30 days."
        >
          <DayBars data={goal.perDay} color="gold" />
        </ChartCard>

        <ChartCard
          title="Where installs come from"
          hint="Store split across every counted download."
        >
          <BarList data={goal.byStore} emptyMessage="No downloads recorded yet." />
          <DataTable caption="Store split" rows={goal.byStore} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Referral funnel"
          hint="Each bar is measured against link clicks; the percentage is against the stage above it."
        >
          <Funnel stages={funnel} />
        </ChartCard>

        <ChartCard
          title="Review speed"
          hint="How fast the proof queue is cleared."
        >
          <dl className="grid grid-cols-2 gap-3">
            <OpsFigure label="Submitted" value={formatNumber(ops.submitted)} />
            <OpsFigure label="Reviewed" value={formatNumber(ops.reviewed)} />
            <OpsFigure label="Waiting" value={formatNumber(ops.pending)} />
            <OpsFigure
              label="Typical wait"
              value={ops.medianHours === null ? "—" : `${ops.medianHours}h`}
              sub={
                ops.slowestHours === null
                  ? undefined
                  : `Slowest ${ops.slowestHours}h`
              }
            />
          </dl>
        </ChartCard>
      </div>

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
          label="Redemptions paid"
          value={`₹${formatNumber(money.redemptionPaidInr)}`}
          sub="Points to cash"
          icon={Coins}
          tone="rank"
        />
        <Stat
          label="Queued"
          value={`₹${formatNumber(money.pendingInr)}`}
          sub={`${money.redemptionsOpen} request(s) open`}
          icon={Coins}
          tone="invite"
        />
        <Stat
          label="Cost per download"
          value={
            money.costPerDownloadInr === null
              ? "—"
              : `₹${money.costPerDownloadInr.toFixed(2)}`
          }
          sub="Total spend ÷ downloads"
          icon={Percent}
          tone="poll"
        />
      </div>

      {/* ─── Geography and cohort ──────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <CohortCard title="By city" rows={geography.cities} />
        <CohortCard title="By batch" rows={geography.batches} />
        <CohortCard title="By college" rows={geography.colleges} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Points issued"
          value={data.totals.issued}
          sub="Last 30 days"
          icon={Coins}
          tone="brand"
        />
        <Stat
          label="Points reversed"
          value={data.totals.reversed}
          sub={data.totals.reversed > 0 ? "Revoked or corrected" : "None"}
          icon={TrendingUp}
          tone="reel"
        />
        <Stat
          label="Earning ambassadors"
          value={data.totals.activeEarners}
          sub="Scored at least once"
          icon={Users}
          tone="poll"
        />
        <Stat
          label="Approval rate"
          value={approval}
          sub="Of reviewed screenshots"
          icon={Percent}
          tone="rank"
        />
      </div>

      <ChartCard
        title="Points earned per day"
        hint="Every day in the window, including the ones nobody earned on."
      >
        <DayBars data={data.pointsByDay} color="violet" />
        <DataTable
          caption="Points earned per day"
          rows={data.pointsByDay
            .filter((d) => d.value > 0)
            .map((d) => ({ label: d.day, value: d.value }))}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Where points come from"
          hint="Which part of the programme is actually paying out."
        >
          <BarList
            data={data.earningsBySource}
            color="gold"
            emptyMessage="Nobody has earned anything in this window."
          />
          <DataTable caption="Points by source" rows={data.earningsBySource} />
        </ChartCard>

        <ChartCard
          title="Screenshot outcomes"
          hint="Every submission ever made, by what happened to it."
        >
          <BarList
            data={data.submissionsByStatus.map((row) => ({
              ...row,
              color: STATUS_FILL[row.label],
            }))}
            emptyMessage="No screenshots have been submitted yet."
          />
          <DataTable
            caption="Submissions by status"
            rows={data.submissionsByStatus}
          />
        </ChartCard>

        <ChartCard
          title="Top ambassadors"
          hint="By points earned in the last 30 days."
        >
          <BarList
            data={data.topAmbassadors}
            color="pink"
            emptyMessage="Nobody has scored in this window."
          />
          <DataTable caption="Top ambassadors" rows={data.topAmbassadors} />
        </ChartCard>

        <ChartCard
          title="Responses per survey"
          hint="Counted responses only — duplicates are excluded."
        >
          <BarList
            data={data.responsesBySurvey}
            color="teal"
            emptyMessage="No surveys have collected a response yet."
          />
          <DataTable
            caption="Responses per survey"
            rows={data.responsesBySurvey}
          />
        </ChartCard>
      </div>

      <Note tone="neutral">
        Series colours here are darker steps of the app&apos;s accents: the
        bright UI versions fail a contrast check as chart fills. The steps used
        were validated for colourblind separation, and every bar carries its own
        number so nothing depends on colour alone.
        <span
          aria-hidden
          className="mt-2 flex gap-1.5"
        >
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

function OpsFigure({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <dt className="text-[11px] font-bold tracking-wide text-ink-faint uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[18px] font-extrabold text-ink">{value}</dd>
      {sub && <p className="text-[11.5px] font-semibold text-ink-soft">{sub}</p>}
    </div>
  );
}

/**
 * A cohort breakdown.
 *
 * Sorted by total downloads but showing downloads-per-head beside it, because
 * a city with forty ambassadors will always out-total one with six and the
 * per-head figure is the only comparable number of the two.
 */
function CohortCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; ambassadors: number; downloads: number; perHead: number }[];
}) {
  return (
    <Card>
      <CardBody>
        <h2 className="display text-[15px] text-ink">{title}</h2>

        {rows.length === 0 ? (
          <p className="mt-3 text-[12.5px] font-semibold text-ink-soft">
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {rows.slice(0, 8).map((row) => (
              <li key={row.label} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-ink">
                    {row.label}
                  </p>
                  <p className="text-[11.5px] text-ink-soft">
                    {row.ambassadors} ambassador{row.ambassadors === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-[13.5px] font-extrabold text-ink">
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
  );
}
