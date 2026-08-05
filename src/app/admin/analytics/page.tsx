import {
  Clapperboard,
  ClipboardList,
  Coins,
  Download,
  Percent,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import {
  BarList,
  ChartCard,
  DataTable,
  DayBars,
  SERIES,
} from "@/components/charts";
import { NavSelect, type NavOption } from "@/components/nav-select";
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
 * Four categories, one at a time.
 *
 * Everything on one page meant scrolling past three subjects to reach the
 * fourth, and it invited comparing a download figure against a survey figure
 * that happen to sit next to each other and mean nothing together. Picking a
 * subject first makes each screen answer one question.
 */
const CATEGORIES = [
  { key: "downloads", label: "Downloads", icon: Download },
  { key: "campaigns", label: "Campaigns", icon: Clapperboard },
  { key: "ambassadors", label: "Ambassadors", icon: Users },
  { key: "surveys", label: "Surveys", icon: ClipboardList },
] as const;

type Category = (typeof CATEGORIES)[number]["key"];

/** One window for every figure on screen, whichever category is showing. */
const PERIODS = [
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
] as const;

const DIMENSIONS = [
  { key: "city", label: "By city" },
  { key: "batch", label: "By batch" },
  { key: "college", label: "By college" },
] as const;

type Dimension = (typeof DIMENSIONS)[number]["key"];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; by?: string; cat?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;

  const days = PERIODS.some((p) => p.key === params.days)
    ? Number(params.days)
    : 30;
  const by: Dimension = DIMENSIONS.some((d) => d.key === params.by)
    ? (params.by as Dimension)
    : "city";
  const cat: Category = CATEGORIES.some((c) => c.key === params.cat)
    ? (params.cat as Category)
    : "downloads";

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
    const sp = new URLSearchParams({ days: String(days), by, cat, ...next });
    return `/admin/analytics?${sp.toString()}`;
  };

  const categoryOptions: NavOption[] = CATEGORIES.map((c) => ({
    value: href({ cat: c.key }),
    label: c.label,
  }));

  const periodOptions: NavOption[] = PERIODS.map((p) => ({
    value: href({ days: p.key }),
    label: p.label,
  }));

  const dimensionOptions: NavOption[] = DIMENSIONS.map((d) => ({
    value: href({ by: d.key }),
    label: d.label,
  }));

  const cohort =
    by === "batch"
      ? geography.batches
      : by === "college"
        ? geography.colleges
        : geography.cities;

  const windowLabel = `Last ${days} days`;
  const active = CATEGORIES.find((c) => c.key === cat)!;
  const ActiveIcon = active.icon;

  const responses = data.responsesBySurvey.reduce(
    (sum, row) => sum + row.value,
    0,
  );

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">Analytics</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            One subject, one window. Everything on screen moves together.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <NavSelect
            label="Category"
            value={href({ cat })}
            options={categoryOptions}
          />
          <NavSelect
            label="Period"
            value={href({ days: String(days) })}
            options={periodOptions}
          />
        </div>
      </div>

      {/* The tag repeats the choice as a heading, so a screenshot of this page
          says what it is without the dropdown being in frame. */}
      <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3.5 py-1.5 text-[12.5px] font-extrabold text-blue-700">
        <ActiveIcon className="size-3.5" />
        {active.label} · {windowLabel}
      </span>

      {/* ─── Downloads ─────────────────────────────────────────────────────── */}
      {cat === "downloads" && (
        <>
          <GoalTracker goal={goal} />

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

            <ChartCard
              title="Where installs come from"
              hint="Store split, all time."
            >
              <BarList
                data={goal.byStore}
                emptyMessage="No downloads recorded yet."
              />
              <DataTable caption="Store split" rows={goal.byStore} />
            </ChartCard>
          </div>

          <Card>
            <CardBody>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="display text-[16px] text-ink">Breakdown</h2>
                  <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
                    Downloads per head as well as the total — a group of thirty
                    will always out-total a group of six.
                  </p>
                </div>
                <NavSelect
                  label="Group"
                  value={href({ by })}
                  options={dimensionOptions}
                />
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
                        <p className="text-[11px] text-ink-soft">
                          {row.perHead} each
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {/* ─── Campaigns ─────────────────────────────────────────────────────── */}
      {cat === "campaigns" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Success rate"
              value={success}
              sub="Of reviewed screenshots"
              icon={Percent}
              tone="poll"
            />
            <Stat
              label="Approved"
              value={formatNumber(
                data.submissionsByStatus
                  .filter((s) => s.label.includes("pproved"))
                  .reduce((sum, s) => sum + s.value, 0),
              )}
              sub={windowLabel}
              icon={Clapperboard}
              tone="brand"
            />
            <Stat
              label="Waiting"
              value={formatNumber(
                data.submissionsByStatus
                  .filter(
                    (s) => s.label === "Needs review" || s.label === "Checking",
                  )
                  .reduce((sum, s) => sum + s.value, 0),
              )}
              sub="In the review queue"
              icon={Clapperboard}
              tone="invite"
            />
            <Stat
              label="Rejected"
              value={formatNumber(
                data.submissionsByStatus
                  .filter(
                    (s) => s.label === "Rejected" || s.label === "Revoked",
                  )
                  .reduce((sum, s) => sum + s.value, 0),
              )}
              sub={windowLabel}
              icon={Clapperboard}
              tone="reel"
            />
          </div>

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
        </>
      )}

      {/* ─── Ambassadors ───────────────────────────────────────────────────── */}
      {cat === "ambassadors" && (
        <>
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
              label="Stipend paid"
              value={`₹${formatNumber(money.stipendPaidInr)}`}
              sub="To date"
              icon={Wallet}
              tone="rank"
            />
            <Stat
              label="Incentives"
              value={`₹${formatNumber(money.redemptionPaidInr)}`}
              sub="Points turned to cash"
              icon={Wallet}
              tone="poll"
            />
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

            <Card>
              <CardBody>
                <h2 className="display text-[16px] text-ink">Money out</h2>
                <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
                  What has been sent, and what is still owed.
                </p>
                <dl className="mt-4 space-y-2.5">
                  <MoneyRow
                    label="To be paid"
                    value={`₹${formatNumber(money.pendingInr)}`}
                    sub={`${money.redemptionsOpen} request${money.redemptionsOpen === 1 ? "" : "s"} open`}
                  />
                  <MoneyRow
                    label="Stipend paid"
                    value={`₹${formatNumber(money.stipendPaidInr)}`}
                    sub="All time"
                  />
                  <MoneyRow
                    label="Incentives paid"
                    value={`₹${formatNumber(money.redemptionPaidInr)}`}
                    sub="All time"
                  />
                </dl>
              </CardBody>
            </Card>
          </div>
        </>
      )}

      {/* ─── Surveys ───────────────────────────────────────────────────────── */}
      {cat === "surveys" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Responses"
              value={formatNumber(responses)}
              sub={windowLabel}
              icon={ClipboardList}
              tone="poll"
            />
            <Stat
              label="Surveys collecting"
              value={formatNumber(data.responsesBySurvey.length)}
              sub="With at least one response"
              icon={ClipboardList}
              tone="brand"
            />
            <Stat
              label="Points from surveys"
              value={formatNumber(
                data.earningsBySource.find((s) => s.label === "Surveys")?.value ??
                  0,
              )}
              sub={windowLabel}
              icon={Coins}
              tone="rank"
            />
            <Stat
              label="Best survey"
              value={formatNumber(data.responsesBySurvey[0]?.value ?? 0)}
              sub={data.responsesBySurvey[0]?.label ?? "Nothing yet"}
              icon={ClipboardList}
              tone="invite"
            />
          </div>

          <ChartCard title="Responses per survey" hint={windowLabel}>
            <BarList
              data={data.responsesBySurvey}
              color="teal"
              emptyMessage="No responses in this window."
            />
            <DataTable caption="Responses per survey" rows={data.responsesBySurvey} />
          </ChartCard>
        </>
      )}

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

function MoneyRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5">
      <div>
        <dt className="text-[13px] font-bold text-ink">{label}</dt>
        <p className="text-[11.5px] font-semibold text-ink-soft">{sub}</p>
      </div>
      <dd className="tabular shrink-0 text-[16px] font-extrabold text-ink">
        {value}
      </dd>
    </div>
  );
}
