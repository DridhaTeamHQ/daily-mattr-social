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
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { readAll } from "@/lib/admin/read-all";
import { requireAdmin } from "@/lib/admin/queries";
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

export default async function AnalyticsPage() {
  await requireAdmin();

  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const trendStart = new Date(now);
  trendStart.setDate(now.getDate() - 13);
  trendStart.setHours(0, 0, 0, 0);

  const [profiles, campaigns] = await Promise.all([
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

  const activeCampaigns = ((campaigns.data ?? []) as Campaign[]).filter(
    (campaign) =>
      new Date(campaign.starts_at) < nextMonth &&
      (!campaign.ends_at || new Date(campaign.ends_at) >= monthStart),
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
  const relevantSubmissions = submissions.filter((submission) =>
    taskIds.has(submission.campaign_task_id),
  );

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

  const approvalsByDay = new Map<string, number>();
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(trendStart);
    date.setDate(trendStart.getDate() + (13 - offset));
    approvalsByDay.set(date.toISOString().slice(0, 10), 0);
  }
  for (const submission of relevantSubmissions) {
    if (!APPROVED.has(submission.status)) continue;
    const day = new Date(submission.uploaded_at).toISOString().slice(0, 10);
    if (approvalsByDay.has(day)) {
      approvalsByDay.set(day, (approvalsByDay.get(day) ?? 0) + 1);
    }
  }
  const approvalTrend = [...approvalsByDay.entries()].map(([day, value]) => ({
    day,
    value,
  }));

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">Analytics</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Current-month task completion across active ambassadors.
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
          sub={`${activeCampaigns.length} campaign${activeCampaigns.length === 1 ? "" : "s"} this month`}
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
          sub="Current campaign submissions"
          icon={Clock3}
          tone="invite"
        />
      </div>

      {taskTotal === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No active tasks this month"
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
              emptyMessage="No active campaigns this month."
            />
          </ChartCard>
          <ChartCard
            title="Approved tasks"
            hint="Approved submissions uploaded over the last 14 days."
          >
            {approvalTrend.some((day) => day.value > 0) ? (
              <DayBars data={approvalTrend} color="violet" unit=" approved" />
            ) : (
              <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
                No approved tasks in the last 14 days.
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
    </div>
  );
}
