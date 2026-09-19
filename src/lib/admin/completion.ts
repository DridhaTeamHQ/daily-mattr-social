import type { SupabaseClient } from "@supabase/supabase-js";

import { readAll } from "@/lib/admin/read-all";
import { getViewingVersion } from "@/lib/programme-version";
import type { Period } from "@/lib/admin/period";
import type { Cohort } from "@/lib/admin/scope";

/**
 * The arithmetic behind "Completion by ambassador".
 *
 * It lives here rather than in the page because two things now render it: the
 * table on /admin/analytics and the CSV behind Download ambassadors. A second
 * copy of "is this person eligible" is how the screen and the spreadsheet
 * start disagreeing about who gets paid, and the disagreement would surface
 * as somebody chasing an ambassador about a row that the other view says is
 * fine.
 *
 * Everything returned is scoped to one cohort and one period. Nothing in here
 * reads `searchParams` or renders — the callers resolve the scope and this
 * answers for it.
 */

const APPROVED = new Set(["approved", "auto_approved"]);

/**
 * What the monthly stipend asks for: 80% of their tasks approved and fifteen
 * counted downloads, and both of them — one without the other is not a
 * qualifying month.
 *
 * The same rule `stipend_eligibility()` pays on (migration 0043), read from
 * the same two `app_settings` rows. Hard-coded here rather than fetched
 * because this is a column on a page that already makes six round trips; if
 * the bar moves, it moves in one migration and in these two lines.
 *
 * Know this before reading the Stipend column against /admin/stipend: the
 * two count different spans. This page answers "of the work open to you
 * since you joined, how much is done", and takes downloads as the lifetime
 * figure /admin/referrals prints. `stipend_eligibility()` answers both
 * halves inside one calendar month. They agree for anybody who joined this
 * month and diverge for everybody else — an August ambassador reads
 * Eligible here on a year's work and is paid on September's.
 *
 * This column is the recruiting and coaching view; the payout page is the
 * one that pays. Moving the SQL onto the same rule is a migration, not an
 * edit here — see the note in the commit that introduced this.
 */
export const STIPEND_MIN_DOWNLOADS = 15;
export const STIPEND_MIN_COMPLETION_PCT = 80;
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
export function percentages(counts: number[], total: number): number[] {
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
  ended_at: string | null;
};

/**
 * The moment a campaign stopped accepting work, as a timestamp.
 *
 * Uploads are refused once the campaign is no longer `live` or its deadline
 * has passed — see the guards in `src/lib/submissions/actions.ts` — so the
 * end is the earlier of the deadline an admin typed and the moment the
 * campaign was actually ended. A live campaign with no deadline has not
 * closed at all.
 *
 * `ended_at` is read rather than `updated_at`, which this used to fall back
 * to: any later edit touches `updated_at`, and migration 0040's own backfill
 * touched all seven ended campaigns at once. Every one of them then looked
 * like it had closed that afternoon, after the last ambassador joined, which
 * is how all 62 rows came to show the same total. `ended_at` is stamped once,
 * by a trigger, when the campaign first enters an end state.
 */
function closedAt(campaign: Campaign): number {
  const stamps = [campaign.ends_at, campaign.ended_at]
    .filter((at): at is string => Boolean(at))
    .map((at) => new Date(at).getTime());
  return stamps.length ? Math.min(...stamps) : Number.POSITIVE_INFINITY;
}

type Submission = {
  ambassador_id: string;
  campaign_task_id: string;
  status: string;
  uploaded_at: string;
};

type Conversion = {
  ambassador_id: string;
  status: string;
  converted_at: string;
};

export type CompletionScope = {
  cohort: Cohort;
  period: Period;
};

export async function getCompletionByAmbassador(
  supabase: SupabaseClient,
  { cohort, period }: CompletionScope,
) {
  // The run this page is about. Resolved here and not handed in, so the
  // table on /admin/analytics and the CSV behind Download ambassadors cannot
  // end up reading different runs of the programme.
  const version = await getViewingVersion();

  const [allProfiles, campaigns] = await Promise.all([
    readAll<{
      id: string;
      full_name: string;
      college: string | null;
      batch: string | null;
      created_at: string;
      activated_at: string | null;
    }>(
      (from, to) =>
        supabase
          .from("profiles")
          .select("id, full_name, college, batch, created_at, activated_at")
          .eq("role", "ambassador")
          .eq("status", "active")
          .order("id")
          .range(from, to),
      "analytics.profiles",
    ),
    supabase
      .from("campaigns")
      .select("id, title, status, starts_at, ends_at, ended_at")
      .neq("status", "draft")
      .eq("version", version),
  ]);

  // Every figure below divides by the number of ambassadors, so the cohort has
  // to be applied here rather than to the finished numbers: a completion rate
  // filtered after the fact would still be over the whole programme's tasks.
  const profiles = cohort.ids
    ? allProfiles.filter((profile) => cohort.ids?.has(profile.id))
    : allProfiles;

  // Every campaign that had started by the end of the window, with no floor
  // on when it closed. The floor belongs on the ambassador, not on the
  // calendar: `availableTo` drops a campaign that shut before somebody
  // joined, and what is left is exactly the work that person has either done
  // or missed since they accepted — which is what Total means.
  //
  // `ends_at >= period.start` used to be the lower bound, and it cut the
  // wrong way twice. A campaign an admin ends by hand carries no deadline at
  // all, so the five quiz campaigns closed on 25 August sailed through it
  // while "Share moneymattr reel on your Instagram story" — which ran and
  // ended on 31 August, 48 ambassadors could reach and 25 completed — was
  // dropped for everybody, because its deadline lands one minute before the
  // IST month boundary.
  const activeCampaigns = ((campaigns.data ?? []) as Campaign[]).filter(
    (campaign) => new Date(campaign.starts_at) < period.end,
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

  // Downloads: every counted conversion against their code, exactly the
  // figure /admin/referrals prints in its Downloads column. A voided
  // conversion is a row the programme decided not to credit, so it is not a
  // download on either page.
  //
  // Not scoped to the period, and that is deliberate. This used to count
  // only conversions inside the window, so an admin reading Soma Yella
  // Anjani Sai here saw 39 and on the referrals page saw 52 — two numbers
  // for one ambassador's code, with nothing on either screen to say which
  // window it was. One number, one meaning.
  const conversions = await readAll<Conversion>(
    (from, to) =>
      supabase
        .from("referral_conversions")
        .select("ambassador_id, status, converted_at")
        .eq("status", "counted")
        .eq("version", version)
        .order("id")
        .range(from, to),
    "analytics.conversions",
  );
  const downloadsByAmbassador = new Map<string, number>();
  for (const conversion of conversions) {
    if (cohort.ids && !cohort.ids.has(conversion.ambassador_id)) continue;
    downloadsByAmbassador.set(
      conversion.ambassador_id,
      (downloadsByAmbassador.get(conversion.ambassador_id) ?? 0) + 1,
    );
  }

  // Surveys are tasks too — migration 0045. The student's Tasks page has
  // always listed them in the same feed as campaigns, so counting only
  // campaigns here made the admin's total disagree with the page the student
  // is looking at.
  const [{ data: surveyRows }, surveyLinks, surveyResponses] = await Promise.all([
    supabase
      .from("surveys")
      .select("id, status, audience, response_cap, created_at, closed_at")
      .neq("status", "draft")
      .eq("version", version),
    // Links need no filter of their own: every one is dropped below unless
    // its survey is in `periodSurveys`, which is already this run's only.
    readAll<{ ambassador_id: string; survey_id: string }>(
      (from, to) =>
        supabase
          .from("survey_links")
          .select("ambassador_id, survey_id")
          .order("id")
          .range(from, to),
      "completion.surveyLinks",
    ),
    readAll<{ ambassador_id: string; survey_id: string; status: string }>(
      (from, to) =>
        supabase
          .from("survey_responses")
          .select("ambassador_id, survey_id, status")
          .eq("version", version)
          .order("id")
          .range(from, to),
      "completion.surveyResponses",
    ),
  ]);

  const submissions = await readAll<Submission>(
    (from, to) =>
      supabase
        .from("submissions")
        .select("ambassador_id, campaign_task_id, status, uploaded_at")
        .eq("version", version)
        .order("id")
        .range(from, to),
    "analytics.submissions",
  );
  // Uploads on a task in the pool, by somebody in the cohort. The cohort test
  // lets everyone through when no filter is set, including people who have
  // since been suspended.
  //
  // There is no lower bound on the date, and that is the whole point: Total
  // counts every task reachable since the ambassador joined, so Approved has
  // to count every approval they hold against those tasks. Floored at
  // `period.start`, the two halves measured different spans — an August
  // ambassador was credited with September's uploads against a pool that
  // still held all of August's work. Ryava Bhavana had 17 of her 17
  // reachable tasks approved and the table read 38%.
  //
  // `completion_leaderboard` has never put a date on its submission join
  // either; this is the page catching up to the figure the student sees.
  const relevantSubmissions = submissions.filter((submission) => {
    const uploadedAt = new Date(submission.uploaded_at);
    return (
      taskIds.has(submission.campaign_task_id) &&
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
   * The bar that finishes a survey, copied from `surveyTargetFor` in
   * src/lib/queries.ts — the same number printed on the student's card. A
   * survey is collection work, not a button: one response does not finish a
   * public one.
   */
  const SURVEY_TARGET_FALLBACK = 10;
  type Survey = {
    id: string;
    status: string;
    audience: string | null;
    response_cap: number | null;
    created_at: string;
    closed_at: string | null;
  };
  function surveyTarget(survey: Survey): number {
    if (survey.audience === "participant") return 1;
    if (survey.response_cap && survey.response_cap > 0) return survey.response_cap;
    return SURVEY_TARGET_FALLBACK;
  }

  // Surveys that ran in the period, and when each stopped being actionable —
  // live ones never do, exactly like a live campaign.
  const periodSurveys = new Map<string, { closed: number; target: number }>();
  for (const survey of (surveyRows ?? []) as Survey[]) {
    if (new Date(survey.created_at) >= period.end) continue;
    periodSurveys.set(survey.id, {
      closed:
        survey.status === "live" || !survey.closed_at
          ? Number.POSITIVE_INFINITY
          : new Date(survey.closed_at).getTime(),
      target: surveyTarget(survey),
    });
  }

  // Valid responses each ambassador gathered, per survey.
  const answers = new Map<string, number>();
  for (const response of surveyResponses) {
    if (response.status !== "valid") continue;
    const key = `${response.ambassador_id}:${response.survey_id}`;
    answers.set(key, (answers.get(key) ?? 0) + 1);
  }

  // The surveys issued to each ambassador, as [survey id] lists.
  const linksByAmbassador = new Map<string, string[]>();
  for (const link of surveyLinks) {
    if (!periodSurveys.has(link.survey_id)) continue;
    const held = linksByAmbassador.get(link.ambassador_id) ?? [];
    held.push(link.survey_id);
    linksByAmbassador.set(link.ambassador_id, held);
  }

  /** This ambassador's surveys in the period: how many, and how many finished. */
  function surveysFor(
    ambassadorId: string,
    joined: number,
  ): { total: number; done: number } {
    let total = 0;
    let done = 0;
    for (const surveyId of linksByAmbassador.get(ambassadorId) ?? []) {
      const survey = periodSurveys.get(surveyId);
      // Same reachability test campaigns get: one that shut before they
      // joined was never theirs to do.
      if (!survey || joined >= survey.closed) continue;
      total += 1;
      if ((answers.get(`${ambassadorId}:${surveyId}`) ?? 0) >= survey.target) {
        done += 1;
      }
    }
    return { total, done };
  }

  /**
   * When this ambassador's membership started, as a timestamp.
   *
   * `created_at` is when an admin sent the invite, not when the student took
   * it up — a batch invited on the 7th and opened over the following week all
   * dates as the 7th. `activated_at` is the moment they set a password, and
   * is only null for an invite still unopened, which has no other date to be
   * measured from. Mirrors migration 0041, which floors the leaderboard and
   * the student's own Tasks page on the same pair.
   */
  function joinedAt(profile: { created_at: string; activated_at: string | null }): number {
    return new Date(profile.activated_at ?? profile.created_at).getTime();
  }

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
  function availableTo(joined: number): number {
    let total = 0;
    for (const campaign of campaignWindows) {
      if (joined < campaign.closed) total += campaign.tasks;
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
    // Approved, Rejections and Completion are measured from the ambassador's
    // join date, above. The three tiles at the top of the page are not:
    // "Awaiting review" and "Approval rate" are asking what happened in the
    // window the picker selected, and answering them over all time would make
    // the Day and Week views identical to the Month.
    const inPeriod = new Date(submission.uploaded_at) >= period.start;
    const campaignId = taskCampaign.get(submission.campaign_task_id);
    if (campaignId) {
      submittedByCampaign.set(
        campaignId,
        (submittedByCampaign.get(campaignId) ?? 0) + 1,
      );
    }
    if (!DECIDED.has(submission.status)) {
      if (inPeriod) pendingReview += 1;
      const waiting =
        pendingTasksByAmbassador.get(submission.ambassador_id) ?? new Set();
      waiting.add(submission.campaign_task_id);
      pendingTasksByAmbassador.set(submission.ambassador_id, waiting);
    }
    if (DECIDED.has(submission.status) && inPeriod) decided += 1;
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

    if (inPeriod) approvedSubmissions += 1;
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
    (total, profile) =>
      total +
      availableTo(joinedAt(profile)) +
      surveysFor(profile.id, joinedAt(profile)).total,
    0,
  );
  const completedTasks = profiles.reduce(
    (total, profile) =>
      total +
      (approvedByAmbassador.get(profile.id)?.size ?? 0) +
      surveysFor(profile.id, joinedAt(profile)).done,
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
      const joined = joinedAt(profile);
      // Campaign tasks and surveys in one pool — the same two things the
      // student's own Tasks page lists. A survey that is not finished is
      // pending, and one they have filled counts as approved: nobody reviews
      // a survey, the responses are the proof.
      const surveys = surveysFor(profile.id, joined);
      const total = availableTo(joined) + surveys.total;
      const approvedAll = approved + surveys.done;
      const pending = Math.max(0, total - approvedAll - sentBack);
      const [completion, rejection, remainder] = percentages(
        [approvedAll, sentBack, pending],
        approvedAll + sentBack + pending,
      );
      const downloads = downloadsByAmbassador.get(profile.id) ?? 0;
      const downloadsShort = STIPEND_MIN_DOWNLOADS - downloads;
      return {
        ...profile,
        total,
        approved: approvedAll,
        surveysTotal: surveys.total,
        surveysDone: surveys.done,
        downloads,
        downloadsShort,
        // Both bars, not either: the rule is an and. Completion is the share
        // of their own reachable pool, so a late joiner is asked for 80% of
        // what was open to them rather than 80% of a month they missed half
        // of.
        eligible:
          downloads >= STIPEND_MIN_DOWNLOADS &&
          completion >= STIPEND_MIN_COMPLETION_PCT,
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
        (profile) => joinedAt(profile) < closes,
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
        // The percentage says how far along the task is; the page it opens
        // says which of the 62 are the ones behind it.
        href: `/admin/campaigns/${campaign.id}`,
      };
    })
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);
  return {
    profiles,
    ranked,
    campaignPerformance,
    taskTotal,
    activeCampaigns,
    availableAssignments,
    completedTasks,
    completionPct,
    approvalPct,
    approvedSubmissions,
    pendingReview,
  };
}
