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
import { ProgressBar, Stat } from "@/components/ui/stat";
import { readAll } from "@/lib/admin/read-all";
import { requireAdmin } from "@/lib/admin/queries";
import { readPeriod, resolvePeriod } from "@/lib/admin/period";
import {
  DIMENSIONS,
  getCohort,
  readCohortFilters,
  type Dimension,
} from "@/lib/admin/scope";
import { createCachedClient as createClient } from "@/lib/admin/cached-client";
import { formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Analytics" };

const APPROVED = new Set(["approved", "auto_approved"]);
const DECIDED = new Set(["approved", "auto_approved", "rejected", "revoked"]);
const REJECTED = new Set(["rejected", "revoked"]);

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
    readAll<{
      id: string;
      full_name: string;
      college: string | null;
      city: string | null;
      batch: string | null;
    }>(
      (from, to) =>
        supabase
          .from("profiles")
          .select("id, full_name, college, city, batch")
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
  // Rejections are counted per upload, not per task: two rejected attempts at
  // the same brief are two pieces of work sent back, and collapsing them to
  // one would hide the ambassador who keeps missing.
  const rejectedByAmbassador = new Map<string, number>();
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
    if (REJECTED.has(submission.status)) {
      rejectedByAmbassador.set(
        submission.ambassador_id,
        (rejectedByAmbassador.get(submission.ambassador_id) ?? 0) + 1,
      );
    }
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

  // The whole filtered cohort, not a top eight. Once the table can be narrowed
  // to a college or a batch, "the best eight of the people you selected" is a
  // different question from the one the filters just asked — and the rows at
  // the bottom, the ones who have done nothing, are the ones worth finding.
  const ranked = profiles
    .map((profile) => {
      const approved = approvedByAmbassador.get(profile.id)?.size ?? 0;
      return {
        ...profile,
        approved,
        rejected: rejectedByAmbassador.get(profile.id) ?? 0,
        completion: taskTotal ? Math.round((approved * 100) / taskTotal) : 0,
      };
    })
    .sort(
      (left, right) =>
        right.completion - left.completion ||
        right.approved - left.approved ||
        left.full_name.localeCompare(right.full_name),
    );

  const campaignPerformance = activeCampaigns
    .map((campaign) => {
      const campaignTaskCount = taskRows.filter(
        (task) => task.campaign_id === campaign.id,
      ).length;
      const approved = approvedByCampaign.get(campaign.id)?.size ?? 0;
      const total = campaignTaskCount * profiles.length;
      return {
        // Two campaigns can carry the same title — running the same brief a
        // second month is normal — so the row is identified by the campaign,
        // not by what it is called.
        id: campaign.id,
        label: campaign.title,
        value: total ? Math.round((approved * 100) / total) : 0,
        sub: `${approved}/${total} approved tasks`,
      };
    })
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);

  // "Hyderabad · Batch 2 · this month", or just the period when nothing is
  // narrowed. Built from the same cohort object the filter row renders from,
  // so the two can never describe different slices.
  const scopeSummary = [
    ...DIMENSIONS.map(({ key }) => cohort.filters[key]).filter(Boolean),
    period.noun,
  ].join(" · ");

  // Only the cohort dimensions travel to the export, never the period — the
  // route returns a lifetime roster, and a `period` in the URL would promise a
  // time slice it does not apply. See the comment at the top of that route.
  const exportParams = new URLSearchParams();
  for (const { key } of DIMENSIONS) {
    const value = cohort.filters[key];
    if (value) exportParams.set(key, value);
  }
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
            <Users className="size-5 shrink-0 text-ink-soft" />
          </div>
        </CardBody>

        {ranked.length === 0 ? (
          <CardBody>
            <EmptyState title="No active ambassadors" />
          </CardBody>
        ) : (
          // Horizontal scroll rather than dropping columns: the counts have
          // to stay readable next to the completion they explain. College is
          // not among them — it is the longest field on the row and the one
          // the filters above already say, so it buys nothing here.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left">
              <thead className="border-y border-line bg-canvas-sunk">
                <tr className="text-[11.5px] tracking-wide text-ink-faint uppercase">
                  <th className="w-12 px-4 py-2.5 text-center font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Ambassador</th>
                  <th className="px-4 py-2.5 font-medium">City</th>
                  <th className="px-4 py-2.5 font-medium">Batch</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Rejections
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">Approved</th>
                  <th className="w-44 px-4 py-2.5 text-right font-medium">
                    Completion
                  </th>
                </tr>
              </thead>

              <InfiniteTableBody
                key={`${period.key}:${cohort.filters.city}:${cohort.filters.college}:${cohort.filters.batch}`}
                colSpan={8}
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
                      {ambassador.city || "—"}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-ink-soft">
                      {ambassador.batch || "—"}
                    </td>

                    <td className="tabular px-4 py-3 text-right text-[13px] text-ink-soft">
                      {formatNumber(taskTotal)}
                    </td>

                    {/* A dash rather than a column of zeroes: the rejections
                        worth reading are the ones somebody has, and nought is
                        the answer for most of the table. */}
                    <td className="tabular px-4 py-3 text-right text-[13px] font-bold text-ink-soft">
                      {ambassador.rejected
                        ? formatNumber(ambassador.rejected)
                        : "—"}
                    </td>

                    <td className="tabular px-4 py-3 text-right text-[13px] font-bold text-ink">
                      {formatNumber(ambassador.approved)}
                    </td>

                    <td className="px-4 py-3">
                      {/* The bar carries the comparison, the number carries the
                          value — reading a column of percentages for the gap
                          between 30% and 20% is work a length does for free. */}
                      <div className="flex items-center justify-end gap-2.5">
                        <ProgressBar
                          value={ambassador.completion}
                          max={100}
                          tone="brand"
                          className="h-2 w-24 shrink-0"
                        />
                        <span className="tabular w-10 text-right text-[13px] font-extrabold text-ink">
                          {ambassador.completion}%
                        </span>
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
