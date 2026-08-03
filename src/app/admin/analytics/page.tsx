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
import { getAnalytics, requireAdmin } from "@/lib/admin/queries";

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
  const data = await getAnalytics(30);

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
