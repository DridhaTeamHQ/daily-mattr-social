import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ListChecks,
  Users,
} from "lucide-react";

import { BarList, ChartCard, DayBars } from "@/components/charts";
import { CohortFilter } from "@/components/cohort-filter";
import { PeriodFilter } from "@/components/period-filter";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { readAll } from "@/lib/admin/read-all";
import { requireAdmin } from "@/lib/admin/queries";
import { istDay, readPeriod, resolvePeriod } from "@/lib/admin/period";
import { getCohort, readCohortFilters, type Dimension } from "@/lib/admin/scope";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Analytics" };

const APPROVED = new Set(["approved", "auto_approved"]);
const DECIDED = new Set(["approved", "auto_approved", "rejected", "revoked"]);

type Campaign = {
  id: string;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
};

type Submission = {
  ambassador_id: string;
  campaign_task_id: string;
  status: string;
  uploaded_at: string;
};

/** "14:00–15:00" as "2 PM", in IST like every other date on this page. */
function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

/** "2026-08" as "Aug 2026". */
function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Months from the first with activity to the last, gaps included as zeroes. */
function fillMonths(entries: [string, number][]): [string, number][] {
  if (entries.length === 0) return [];

  const counts = new Map(entries);
  const months = [...counts.keys()].sort();
  const filled: [string, number][] = [];

  for (
    let cursor = months[0];
    cursor <= months[months.length - 1];
    cursor = nextMonth(cursor)
  ) {
    filled.push([cursor, counts.get(cursor) ?? 0]);
  }

  return filled;
}

function nextMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return index === 12
    ? `${year + 1}-01`
    : `${year}-${String(index + 1).padStart(2, "0")}`;
}

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

  const [allProfiles, campaigns] = await Promise.all([
    readAll<{ id: string; full_name: string; college: string | null }>(
      (from, to) =>
        supabase
          .from("profiles")
          .select("id, full_name, college")
          .eq("role", "ambassador")
          .eq("status", "active")
          .order("id")
          .range(from, to),
      "analytics.profiles",
    ),
    supabase
      .from("campaigns")
      .select("id, title, status, starts_at, ends_at")
      .neq("status", "draft"),
  ]);

  // Every figure below divides by the number of ambassadors, so the cohort has
  // to be applied here rather than to the finished numbers: a completion rate
  // filtered after the fact would still be over the whole programme's tasks.
  const profiles = cohort.ids
    ? allProfiles.filter((profile) => cohort.ids?.has(profile.id))
    : allProfiles;

  // A campaign counts if it was running at any point in the period — one that
  // ended on Tuesday is part of this week, and dropping it would credit its
  // approvals to no campaign at all.
  const activeCampaigns = ((campaigns.data ?? []) as Campaign[]).filter(
    (campaign) =>
      new Date(campaign.starts_at) < period.end &&
      (!campaign.ends_at || new Date(campaign.ends_at) >= period.start),
  );
  const campaignIds = activeCampaigns.map((campaign) => campaign.id);
  const { data: tasks } = campaignIds.length
    ? await supabase
        .from("campaign_tasks")
        .select("id, campaign_id")
        .in("campaign_id", campaignIds)
    : { data: [] as { id: string; campaign_id: string }[] };
  const taskRows = tasks ?? [];
  const taskIds = new Set(taskRows.map((task) => task.id));

  const submissions = await readAll<Submission>(
    (from, to) =>
      supabase
        .from("submissions")
        .select("ambassador_id, campaign_task_id, status, uploaded_at")
        .order("id")
        .range(from, to),
    "analytics.submissions",
  );
  // Uploads inside the period, on a task belonging to a campaign that ran in
  // it, by somebody in the cohort. The cohort test lets everyone through when
  // no filter is set, including people who have since been suspended.
  const relevantSubmissions = submissions.filter((submission) => {
    const uploadedAt = new Date(submission.uploaded_at);
    return (
      taskIds.has(submission.campaign_task_id) &&
      uploadedAt >= period.start &&
      uploadedAt < period.end &&
      (!cohort.ids || cohort.ids.has(submission.ambassador_id))
    );
  });

  const taskTotal = taskRows.length;
  const approvedByAmbassador = new Map<string, Set<string>>();
  const approvedByCampaign = new Map<string, Set<string>>();
  const submittedByCampaign = new Map<string, number>();
  const taskCampaign = new Map(taskRows.map((task) => [task.id, task.campaign_id]));
  let pendingReview = 0;
  let decided = 0;
  let approvedSubmissions = 0;

  for (const submission of relevantSubmissions) {
    const campaignId = taskCampaign.get(submission.campaign_task_id);
    if (campaignId) {
      submittedByCampaign.set(
        campaignId,
        (submittedByCampaign.get(campaignId) ?? 0) + 1,
      );
    }
    if (!DECIDED.has(submission.status)) pendingReview += 1;
    if (DECIDED.has(submission.status)) decided += 1;
    if (!APPROVED.has(submission.status)) continue;

    approvedSubmissions += 1;
    const ambassadorTasks = approvedByAmbassador.get(submission.ambassador_id) ?? new Set();
    ambassadorTasks.add(submission.campaign_task_id);
    approvedByAmbassador.set(submission.ambassador_id, ambassadorTasks);

    if (campaignId) {
      const campaignTasks = approvedByCampaign.get(campaignId) ?? new Set();
      campaignTasks.add(`${submission.ambassador_id}:${submission.campaign_task_id}`);
      approvedByCampaign.set(campaignId, campaignTasks);
    }
  }

  const availableAssignments = profiles.length * taskTotal;
  const completedTasks = [...approvedByAmbassador.values()].reduce(
    (total, tasksForAmbassador) => total + tasksForAmbassador.size,
    0,
  );
  const completionPct = availableAssignments
    ? Math.round((completedTasks * 100) / availableAssignments)
    : 0;
  const approvalPct = decided
    ? Math.round((approvedSubmissions * 100) / decided)
    : 0;

  const topAmbassadors = profiles
    .map((profile) => {
      const approved = approvedByAmbassador.get(profile.id)?.size ?? 0;
      return {
        ...profile,
        approved,
        completion: taskTotal ? Math.round((approved * 100) / taskTotal) : 0,
      };
    })
    .sort((left, right) => right.completion - left.completion || right.approved - left.approved)
    .slice(0, 8);

  const campaignPerformance = activeCampaigns
    .map((campaign) => {
      const campaignTaskCount = taskRows.filter(
        (task) => task.campaign_id === campaign.id,
      ).length;
      const approved = approvedByCampaign.get(campaign.id)?.size ?? 0;
      const total = campaignTaskCount * profiles.length;
      return {
        label: campaign.title,
        value: total ? Math.round((approved * 100) / total) : 0,
        sub: `${approved}/${total} approved tasks`,
      };
    })
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);

  // One bar per day of the period, empty days included — dropping them
  // compresses a quiet week into a busy-looking chart.
  const approvalsByDay = new Map(period.days.map((day) => [day, 0]));
  // A single day has no shape as a bar chart, so it is broken down by the hour
  // instead. Only hours with something in them are listed: twenty-four rows,
  // twenty of them zero, is a worse answer than four rows that mean something.
  const approvalsByHour = new Map<number, number>();
  // Total is charted by month, for the same reason in the other direction — a
  // year of daily bars is a fence, not a chart.
  const approvalsByMonth = new Map<string, number>();

  for (const submission of relevantSubmissions) {
    if (!APPROVED.has(submission.status)) continue;
    const uploadedAt = new Date(submission.uploaded_at);
    const day = istDay(uploadedAt);
    if (approvalsByDay.has(day)) {
      approvalsByDay.set(day, (approvalsByDay.get(day) ?? 0) + 1);
    }
    const hour = new Date(uploadedAt.getTime() + 5.5 * 3_600_000).getUTCHours();
    approvalsByHour.set(hour, (approvalsByHour.get(hour) ?? 0) + 1);
    const month = day.slice(0, 7);
    approvalsByMonth.set(month, (approvalsByMonth.get(month) ?? 0) + 1);
  }

  const approvalTrend = [...approvalsByDay.entries()].map(([day, value]) => ({
    day,
    value,
  }));
  const approvalHours = [...approvalsByHour.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([hour, value]) => ({ label: hourLabel(hour), value }));
  // Chronological, and with the quiet months in between kept: sorting by size
  // would turn a trend into a ranking, and dropping the gaps would hide a
  // month in which nothing happened.
  const approvalMonths = fillMonths([...approvalsByMonth.entries()]).map(
    ([month, value]) => ({ label: monthLabel(month), value }),
  );

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
        <Link
          href="/admin/leaderboard"
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-extrabold text-white hover:bg-ink/85"
        >
          <BarChart3 className="size-4" />
          View leaderboard
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PeriodFilter period={period.key} />
        <CohortFilter cohort={cohort} />
      </div>

      {cohort.empty ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Nobody matches that filter"
            description="No active ambassador is in every one of the selected city, college and batch. Clear one of them to widen the view."
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
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Campaign completion"
            hint="Approved tasks divided by all tasks available to active ambassadors."
          >
            <BarList
              data={campaignPerformance}
              unit="%"
              color="teal"
              emptyMessage={`No active campaigns ${period.noun}.`}
            />
          </ChartCard>
          <ChartCard
            title="Approved tasks"
            hint={
              period.grain === "hour"
                ? "Approved submissions uploaded today, by the hour."
                : period.grain === "month"
                  ? "Approved submissions per month, since the programme started."
                  : `Approved submissions uploaded ${period.noun}.`
            }
          >
            {period.grain === "hour" ? (
              <BarList
                data={approvalHours}
                color="violet"
                emptyMessage="No approved tasks today yet."
              />
            ) : period.grain === "month" ? (
              <BarList
                data={approvalMonths}
                color="violet"
                emptyMessage="No approved tasks yet."
              />
            ) : approvalTrend.some((day) => day.value > 0) ? (
              <DayBars data={approvalTrend} color="violet" unit=" approved" />
            ) : (
              <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
                No approved tasks {period.noun}.
              </p>
            )}
          </ChartCard>
        </div>
      )}

      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="display text-[16px] text-ink">Top completion</h2>
              <p className="mt-1 text-[12.5px] text-ink-soft">
                Active ambassadors ranked by approved task completion.
              </p>
            </div>
            <Users className="size-5 text-ink-soft" />
          </div>
          {topAmbassadors.length === 0 ? (
            <EmptyState title="No active ambassadors" />
          ) : (
            <ul className="mt-4 divide-y divide-gray-100">
              {topAmbassadors.map((ambassador, index) => (
                <li key={ambassador.id} className="flex items-center gap-3 py-3">
                  <span className="w-6 text-center text-[13px] font-extrabold text-ink-faint">
                    {index + 1}
                  </span>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100 text-[12px] font-extrabold text-ink">
                    {initials(ambassador.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/ambassadors/${ambassador.id}`}
                      className="truncate text-[13.5px] font-extrabold text-ink hover:underline"
                    >
                      {ambassador.full_name}
                    </Link>
                    <p className="truncate text-[12px] text-ink-soft">
                      {ambassador.college || "No college set"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-[15px] font-extrabold text-ink">
                      {ambassador.completion}%
                    </p>
                    <p className="text-[11.5px] text-ink-soft">
                      {ambassador.approved}/{taskTotal} approved
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
    </div>
  );
}
