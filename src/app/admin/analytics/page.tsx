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
import { StackedBar, Stat } from "@/components/ui/stat";
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

/**
 * Integer percentages that add to exactly 100.
 *
 * Plain rounding gives 33 + 33 + 33, or 13 + 88, and a row whose parts do not
 * add up reads as a mistake rather than as arithmetic. Every part is floored,
 * and the units that leaves short go, one each, to the parts that lost the
 * most in flooring — the way seats are apportioned. `counts` must add to
 * `total`; with a total of nought every share is nought.
 */
function percentages(counts: number[], total: number): number[] {
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((count) => (count * 100) / total);
  const shares = exact.map(Math.floor);
  const short = 100 - shares.reduce((sum, share) => sum + share, 0);
  const byLoss = exact
    .map((value, index) => ({ index, loss: value - shares[index] }))
    .sort((left, right) => right.loss - left.loss)
    .slice(0, Math.max(0, short));
  for (const { index } of byLoss) shares[index] += 1;
  return shares;
}

type Campaign = {
  id: string;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  updated_at: string;
};

/**
 * The moment a campaign stopped accepting work, as a timestamp.
 *
 * Uploads are refused once the campaign is no longer `live` or its deadline
 * has passed — see the guards in `src/lib/submissions/actions.ts`. A deadline
 * is the exact answer. Without one, a campaign an admin ended by hand leaves
 * no record of when except `updated_at`, which is close enough to decide who
 * was in the programme at the time. A live campaign with no deadline has not
 * closed at all.
 */
function closedAt(campaign: Campaign): number {
  if (campaign.ends_at) return new Date(campaign.ends_at).getTime();
  if (campaign.status === "ended") return new Date(campaign.updated_at).getTime();
  return Number.POSITIVE_INFINITY;
}

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
      created_at: string;
    }>(
      (from, to) =>
        supabase
          .from("profiles")
          .select("id, full_name, college, city, batch, created_at")
          .eq("role", "ambassador")
          .eq("status", "active")
          .order("id")
          .range(from, to),
      "analytics.profiles",
    ),
    supabase
      .from("campaigns")
      .select("id, title, status, starts_at, ends_at, updated_at")
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

  // How many tasks each campaign in the period carries, and when it shut. A
  // campaign nobody can upload to any more is still real work for the people
  // who were here while it was open — it is only unreachable for the ones who
  // were not.
  const tasksPerCampaign = new Map<string, number>();
  for (const task of taskRows) {
    tasksPerCampaign.set(
      task.campaign_id,
      (tasksPerCampaign.get(task.campaign_id) ?? 0) + 1,
    );
  }
  const campaignWindows = activeCampaigns.map((campaign) => ({
    id: campaign.id,
    closed: closedAt(campaign),
    tasks: tasksPerCampaign.get(campaign.id) ?? 0,
  }));

  /**
   * The tasks this ambassador actually had a chance to do.
   *
   * The denominator used to be every task in the period, the same number for
   * everybody, which made the figure unreachable by construction: a campaign
   * that closed in March is in a April joiner's total, and no upload of theirs
   * can ever land on it. So a campaign counts for someone only if they were in
   * the programme before it closed. Work they were here for and skipped stays
   * counted — the point is to drop what was never open to them, not to forgive
   * what was.
   */
  function availableTo(joinedAt: number): number {
    let total = 0;
    for (const campaign of campaignWindows) {
      if (joinedAt < campaign.closed) total += campaign.tasks;
    }
    return total;
  }

  const approvedByAmbassador = new Map<string, Set<string>>();
  // Rejections are counted per upload, not per task: two rejected attempts at
  // the same brief are two pieces of work sent back, and collapsing them to
  // one would hide the ambassador who keeps missing.
  const rejectedByAmbassador = new Map<string, number>();
  // The bar, though, is drawn per task, so it needs the set of tasks a
  // rejection landed on: three rejected attempts at one brief are one task
  // sent back, and painting them as three would show more red than there
  // are tasks. A task that was approved in the end drops out when the bar
  // is built — red is only for work still outstanding. The same goes for
  // the tasks with an upload nobody has ruled on yet.
  const rejectedTasksByAmbassador = new Map<string, Set<string>>();
  const pendingTasksByAmbassador = new Map<string, Set<string>>();
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
    if (!DECIDED.has(submission.status)) {
      pendingReview += 1;
      const waiting =
        pendingTasksByAmbassador.get(submission.ambassador_id) ?? new Set();
      waiting.add(submission.campaign_task_id);
      pendingTasksByAmbassador.set(submission.ambassador_id, waiting);
    }
    if (DECIDED.has(submission.status)) decided += 1;
    if (REJECTED.has(submission.status)) {
      rejectedByAmbassador.set(
        submission.ambassador_id,
        (rejectedByAmbassador.get(submission.ambassador_id) ?? 0) + 1,
      );
      const sentBack =
        rejectedTasksByAmbassador.get(submission.ambassador_id) ?? new Set();
      sentBack.add(submission.campaign_task_id);
      rejectedTasksByAmbassador.set(submission.ambassador_id, sentBack);
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

  // Not `profiles.length * taskTotal`: the rate at the top of the page has to
  // be the same arithmetic as the rows underneath it, or the tile and the
  // table disagree about the same cohort.
  const availableAssignments = profiles.reduce(
    (total, profile) => total + availableTo(new Date(profile.created_at).getTime()),
    0,
  );
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
      // Each task is in exactly one state, settled by its best upload:
      // approved beats an upload still under review beats sent back, so a
      // brief that was rejected and then re-uploaded is pending, not
      // failing. Pending is everything without an outcome yet — waiting on
      // a decision or never submitted — so the three states between them
      // account for every task the ambassador has.
      const approvedTasks = approvedByAmbassador.get(profile.id);
      const pendingTasks = pendingTasksByAmbassador.get(profile.id);
      const approved = approvedTasks?.size ?? 0;
      let sentBack = 0;
      for (const taskId of rejectedTasksByAmbassador.get(profile.id) ?? []) {
        if (!approvedTasks?.has(taskId) && !pendingTasks?.has(taskId)) {
          sentBack += 1;
        }
      }
      // `Math.max` rather than the bare subtraction: an upload can only have
      // happened while its campaign was open, so approved and sent back are
      // inside `total` in any consistent data — but a backfilled or
      // hand-edited row must not be allowed to drive pending negative and
      // silently unbalance the three shares.
      const total = availableTo(new Date(profile.created_at).getTime());
      const pending = Math.max(0, total - approved - sentBack);
      const [completion, rejection, remainder] = percentages(
        [approved, sentBack, pending],
        approved + sentBack + pending,
      );
      return {
        ...profile,
        total,
        approved,
        rejected: rejectedByAmbassador.get(profile.id) ?? 0,
        sentBack,
        pending,
        completion,
        rejection,
        remainder,
      };
    })
    .sort(
      // Somebody who joined after every campaign in the period closed has no
      // tasks to be measured against. They read as 0% next to people who had
      // the whole month and did nothing, so they go below the ranking rather
      // than into the bottom of it.
      (left, right) =>
        Number(right.total > 0) - Number(left.total > 0) ||
        right.completion - left.completion ||
        right.approved - left.approved ||
        left.full_name.localeCompare(right.full_name),
    );

  const campaignPerformance = activeCampaigns
    .map((campaign) => {
      const campaignTaskCount = tasksPerCampaign.get(campaign.id) ?? 0;
      const approved = approvedByCampaign.get(campaign.id)?.size ?? 0;
      // The people who were in the programme before this campaign closed, not
      // the whole cohort: counting a January campaign against ambassadors
      // recruited in March caps it below 100% for reasons that have nothing to
      // do with the campaign.
      const closes = closedAt(campaign);
      const reached = profiles.filter(
        (profile) => new Date(profile.created_at).getTime() < closes,
      ).length;
      const total = campaignTaskCount * reached;
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
          hint="Approved tasks divided by the tasks available to the ambassadors who were in the programme before the campaign closed."
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
          // to stay readable next to the completion they explain. College is
          // not among them — it is the longest field on the row and the one
          // the filters above already say, so it buys nothing here.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left">
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
                  <th className="w-52 px-4 py-2.5 text-right font-medium">
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

                    {/* The ambassador's own pool, not the programme's. Two
                        rows can legitimately show different totals — that is
                        the column saying one of them joined after a campaign
                        had already closed. */}
                    <td className="tabular px-4 py-3 text-right text-[13px] text-ink-soft">
                      {formatNumber(ambassador.total)}
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
