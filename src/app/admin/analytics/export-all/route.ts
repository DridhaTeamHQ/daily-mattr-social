import { getCompletionByAmbassador } from "@/lib/admin/completion";
import {
  STIPEND_DOWNLOADS_ONLY,
  STIPEND_MIN_COMPLETION_PCT,
  STIPEND_TASKS_ROUTE_DOWNLOADS,
  STIPEND_MIN_DOWNLOADS,
} from "@/lib/admin/completion";
import { resolvePeriod } from "@/lib/admin/period";
import { requireAdmin, taskLabel } from "@/lib/admin/queries";
import { readAll } from "@/lib/admin/read-all";
import { cohortLabel, getCohort } from "@/lib/admin/scope";
import { xlsxWorkbookResponse, type WorkbookSheet } from "@/lib/admin/xlsx";
import { listVersions } from "@/lib/programme-version";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything, in one workbook: every run of the programme, every batch, every
 * task, every submission, download and survey response.
 *
 * Built fresh from the database on every click — nothing is cached or stored,
 * so the file is always as current as the moment the button was pressed.
 *
 * Unlike "Download ambassadors", this ignores the page's filters and the
 * version picker on purpose: it is the whole programme, across all runs.
 * Completion figures are the "Total" period, measured per run with the same
 * `getCompletionByAmbassador` the Analytics page renders.
 */

export const dynamic = "force-dynamic";

type Cell = string | number | boolean | null;

const APPROVED = new Set(["approved", "auto_approved"]);
const REJECTED = new Set(["rejected", "revoked"]);

type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  referral_code: string;
  city: string | null;
  college: string | null;
  batch: string | null;
  status: string;
  created_at: string;
  activated_at: string | null;
};

type Campaign = {
  id: string;
  title: string;
  status: string;
  platform: string | null;
  phase: string | null;
  starts_at: string | null;
  ends_at: string | null;
  version: number;
};

type Task = {
  id: string;
  campaign_id: string;
  type: string | null;
  points: number;
  required: boolean;
  order_index: number;
  label_override: string | null;
  platform: string | null;
  task_library: { label: string; platform: string | null } | null;
};

type Submission = {
  id: string;
  ambassador_id: string;
  campaign_task_id: string;
  status: string;
  attempt: number;
  uploaded_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
  version: number;
};

type Conversion = {
  id: string;
  ambassador_id: string;
  code: string;
  status: string;
  source: string;
  converted_at: string | null;
  version: number;
};

type Survey = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  version: number;
};

type SurveyResponse = {
  id: string;
  survey_id: string;
  ambassador_id: string | null;
  status: string;
  respondent_name: string | null;
  respondent_email: string | null;
  respondent_phone: string | null;
  submitted_at: string;
  version: number;
};

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `2026-08-26`, in IST. */
function day(value: string | null | undefined): string {
  return value ? dayFormat.format(new Date(value)) : "";
}

/** `2026-08-26 14:05`, in IST. */
function stamp(value: string | null | undefined): string {
  if (!value) return "";
  const at = new Date(value);
  return `${dayFormat.format(at)} ${timeFormat.format(at)}`;
}

function pct(part: number, whole: number): number {
  return whole ? Math.round((part * 100) / whole) : 0;
}

export async function GET() {
  // Its own guard: this file carries every ambassador's contact details.
  await requireAdmin();

  const supabase = await createClient();
  const versions = await listVersions();
  const versionLabel = new Map(versions.map((v) => [v.id, v.label]));
  const labelOf = (id: number) => versionLabel.get(id) ?? `V${id}`;

  // Each run's time window. Opening a run moves every campaign, survey and
  // submission into it (migration 0053), so the `version` column says nothing
  // about when a task ran — every task reads as the current run. Tasks are
  // placed by when they started instead: a run covers from its start up to
  // the next run's start. The first run also takes anything earlier, and the
  // current run anything later. Downloads are never moved, so they keep their
  // own `version`.
  const windows = versions.map((v, i) => ({
    id: v.id,
    start: i === 0 || !v.startedAt ? new Date(0) : new Date(v.startedAt),
    end:
      i === versions.length - 1
        ? null
        : versions[i + 1].startedAt
          ? new Date(versions[i + 1].startedAt!)
          : v.endedAt
            ? new Date(v.endedAt)
            : null,
  }));
  /** The run a moment in time belongs to. */
  const versionAt = (at: string | null | undefined): number => {
    const time = at ? new Date(at).getTime() : Date.now();
    const hit = windows.find(
      (w) => time >= w.start.getTime() && (w.end === null || time < w.end.getTime()),
    );
    return hit?.id ?? windows[windows.length - 1]?.id ?? 1;
  };

  const [profiles, campaigns, tasks, submissions, conversions, surveys, responses] =
    await Promise.all([
      readAll<Profile>(
        (from, to) =>
          supabase
            .from("profiles")
            .select(
              "id, full_name, email, phone, referral_code, city, college, batch, status, created_at, activated_at",
            )
            .eq("role", "ambassador")
            .order("id")
            .range(from, to),
        "exportAll.profiles",
      ),
      readAll<Campaign>(
        (from, to) =>
          supabase
            .from("campaigns")
            .select("id, title, status, platform, phase, starts_at, ends_at, version")
            .order("id")
            .range(from, to),
        "exportAll.campaigns",
      ),
      readAll<Task>(
        (from, to) =>
          supabase
            .from("campaign_tasks")
            .select(
              "id, campaign_id, type, points, required, order_index, label_override, platform, task_library(label, platform)",
            )
            .order("id")
            .range(from, to) as never,
        "exportAll.tasks",
      ),
      readAll<Submission>(
        (from, to) =>
          supabase
            .from("submissions")
            .select(
              "id, ambassador_id, campaign_task_id, status, attempt, uploaded_at, reviewed_at, reject_reason, version",
            )
            .order("id")
            .range(from, to),
        "exportAll.submissions",
      ),
      readAll<Conversion>(
        (from, to) =>
          supabase
            .from("referral_conversions")
            .select("id, ambassador_id, code, status, source, converted_at, version")
            .order("id")
            .range(from, to),
        "exportAll.conversions",
      ),
      readAll<Survey>(
        (from, to) =>
          supabase
            .from("surveys")
            .select("id, title, status, created_at, version")
            .order("id")
            .range(from, to),
        "exportAll.surveys",
      ),
      readAll<SurveyResponse>(
        (from, to) =>
          supabase
            .from("survey_responses")
            .select(
              "id, survey_id, ambassador_id, status, respondent_name, respondent_email, respondent_phone, submitted_at, version",
            )
            .order("id")
            .range(from, to),
        "exportAll.responses",
      ),
    ]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const surveyById = new Map(surveys.map((s) => [s.id, s]));
  const batchOf = (id: string | null) =>
    cohortLabel("batch", (id && profileById.get(id)?.batch) || "");

  // ─── Per-run figures, from the same read model the Analytics page uses ────

  const cohort = await getCohort(null, null, null);
  const period = resolvePeriod("total");
  const perVersion = await Promise.all(
    versions.map(async (v, i) => ({
      version: v,
      data: await getCompletionByAmbassador(supabase, {
        cohort,
        period,
        version: v.id,
        window: windows[i],
      }),
    })),
  );

  const summary: Cell[][] = [];
  const batchRows: Cell[][] = [];
  const batchTaskRows: Cell[][] = [];
  const ambassadorRows: Cell[][] = [];

  for (const { version: v, data: full } of perVersion) {
    // Only people who had a task open or a download in this run — someone who
    // joined in V3 is not a 0% in V1.
    const data = {
      ...full,
      ranked: full.ranked.filter((row) => row.total > 0 || row.downloads > 0),
    };
    const downloads = data.ranked.reduce((n, row) => n + row.downloads, 0);
    const eligible = data.ranked.filter((row) => row.eligible).length;

    summary.push([
      v.label,
      v.isActive ? "Current" : "Ended",
      day(v.startedAt),
      day(v.endedAt),
      data.ranked.length,
      data.activeCampaigns.length,
      data.taskTotal,
      data.availableAssignments,
      data.completedTasks,
      data.completionPct,
      data.approvedSubmissions,
      data.approvalPct,
      data.pendingReview,
      downloads,
      eligible,
    ]);

    // Group this run's measured ambassadors by batch.
    const byBatch = new Map<string, typeof data.ranked>();
    for (const row of data.ranked) {
      const batch = cohortLabel("batch", row.batch ?? "");
      const list = byBatch.get(batch) ?? [];
      list.push(row);
      byBatch.set(batch, list);
    }

    const batches = [...byBatch.keys()].sort((a, b) => a.localeCompare(b));
    for (const batch of batches) {
      const members = byBatch.get(batch)!;
      const open = members.reduce((n, r) => n + r.total, 0);
      const approved = members.reduce((n, r) => n + r.approved, 0);
      batchRows.push([
        v.label,
        batch,
        members.length,
        open,
        approved,
        pct(approved, open),
        members.reduce((n, r) => n + r.rejected, 0),
        members.reduce((n, r) => n + r.downloads, 0),
        members.filter((r) => r.eligible).length,
      ]);

      const ids = new Set(members.map((m) => m.id));
      for (const task of data.campaignBreakdown(ids)) {
        batchTaskRows.push([
          v.label,
          batch,
          task.label,
          task.approved,
          task.total,
          task.value,
        ]);
      }
    }

    for (const row of data.ranked) {
      const profile = profileById.get(row.id);
      ambassadorRows.push([
        v.label,
        row.full_name,
        profile?.email ?? "",
        profile?.phone ?? "",
        profile?.referral_code ?? "",
        profile?.city ?? "",
        row.college ?? "",
        cohortLabel("batch", row.batch ?? ""),
        row.total,
        row.approved,
        row.surveysDone,
        row.surveysTotal,
        row.rejected,
        row.pending,
        row.completion,
        row.downloads,
        row.eligible ? "Eligible" : "Not met",
      ]);
    }
  }

  // ─── Campaigns and tasks, every run ───────────────────────────────────────

  const subsByTask = new Map<string, Submission[]>();
  for (const s of submissions) {
    const list = subsByTask.get(s.campaign_task_id) ?? [];
    list.push(s);
    subsByTask.set(s.campaign_task_id, list);
  }
  const tasksByCampaign = new Map<string, Task[]>();
  for (const t of tasks) {
    const list = tasksByCampaign.get(t.campaign_id) ?? [];
    list.push(t);
    tasksByCampaign.set(t.campaign_id, list);
  }

  const campaignVersion = new Map(
    campaigns.map((c) => [c.id, versionAt(c.starts_at)]),
  );
  const runOfTask = (taskId: string) => {
    const t = taskById.get(taskId);
    return (t && campaignVersion.get(t.campaign_id)) ?? versionAt(null);
  };
  const surveyVersion = new Map(surveys.map((s) => [s.id, versionAt(s.created_at)]));

  const sortedCampaigns = [...campaigns].sort(
    (a, b) =>
      campaignVersion.get(a.id)! - campaignVersion.get(b.id)! ||
      (a.starts_at ?? "").localeCompare(b.starts_at ?? "") ||
      a.title.localeCompare(b.title),
  );

  const campaignRows: Cell[][] = [];
  const taskRows: Cell[][] = [];
  for (const c of sortedCampaigns) {
    const cTasks = (tasksByCampaign.get(c.id) ?? []).sort(
      (a, b) => a.order_index - b.order_index,
    );
    let subs = 0;
    let approved = 0;
    for (const t of cTasks) {
      const list = subsByTask.get(t.id) ?? [];
      const approvedPeople = new Set(
        list.filter((s) => APPROVED.has(s.status)).map((s) => s.ambassador_id),
      );
      const rejected = list.filter((s) => REJECTED.has(s.status)).length;
      const pending = list.filter(
        (s) => !APPROVED.has(s.status) && !REJECTED.has(s.status),
      ).length;
      subs += list.length;
      approved += approvedPeople.size;
      taskRows.push([
        labelOf(campaignVersion.get(c.id)!),
        c.title,
        taskLabel(t),
        t.platform ?? t.task_library?.platform ?? c.platform ?? "",
        t.points,
        t.required ? "Yes" : "No",
        list.length,
        approvedPeople.size,
        rejected,
        pending,
      ]);
    }
    campaignRows.push([
      labelOf(campaignVersion.get(c.id)!),
      c.title,
      c.status,
      c.platform ?? "",
      c.phase ?? "",
      day(c.starts_at),
      day(c.ends_at),
      cTasks.length,
      subs,
      approved,
    ]);
  }

  // ─── Raw records ──────────────────────────────────────────────────────────

  const submissionRows: Cell[][] = [...submissions]
    .sort(
      (a, b) =>
        runOfTask(a.campaign_task_id) - runOfTask(b.campaign_task_id) ||
        a.uploaded_at.localeCompare(b.uploaded_at),
    )
    .map((s) => {
      const p = profileById.get(s.ambassador_id);
      const t = taskById.get(s.campaign_task_id);
      const c = t ? campaignById.get(t.campaign_id) : undefined;
      return [
        labelOf(runOfTask(s.campaign_task_id)),
        stamp(s.uploaded_at),
        p?.full_name ?? "",
        p?.email ?? "",
        batchOf(s.ambassador_id),
        c?.title ?? "",
        t ? taskLabel(t) : "",
        s.status,
        s.attempt,
        s.reject_reason ?? "",
        stamp(s.reviewed_at),
      ];
    });

  const downloadRows: Cell[][] = [...conversions]
    .sort(
      (a, b) =>
        a.version - b.version || (a.converted_at ?? "").localeCompare(b.converted_at ?? ""),
    )
    .map((d) => {
      const p = profileById.get(d.ambassador_id);
      return [
        labelOf(d.version),
        stamp(d.converted_at),
        p?.full_name ?? "",
        p?.email ?? "",
        batchOf(d.ambassador_id),
        d.code,
        d.status,
        d.source,
      ];
    });

  const responsesBySurvey = new Map<string, SurveyResponse[]>();
  for (const r of responses) {
    const list = responsesBySurvey.get(r.survey_id) ?? [];
    list.push(r);
    responsesBySurvey.set(r.survey_id, list);
  }
  const surveyRows: Cell[][] = [...surveys]
    .sort(
      (a, b) =>
        surveyVersion.get(a.id)! - surveyVersion.get(b.id)! ||
        a.created_at.localeCompare(b.created_at),
    )
    .map((s) => {
      const list = responsesBySurvey.get(s.id) ?? [];
      const valid = list.filter((r) => r.status === "valid").length;
      return [
        labelOf(surveyVersion.get(s.id)!),
        s.title,
        s.status,
        day(s.created_at),
        list.length,
        valid,
        list.length - valid,
      ];
    });

  const responseRows: Cell[][] = [...responses]
    .sort(
      (a, b) =>
        (surveyVersion.get(a.survey_id) ?? 0) - (surveyVersion.get(b.survey_id) ?? 0) ||
        a.submitted_at.localeCompare(b.submitted_at),
    )
    .map((r) => {
      const p = r.ambassador_id ? profileById.get(r.ambassador_id) : undefined;
      return [
        labelOf(surveyVersion.get(r.survey_id) ?? versionAt(r.submitted_at)),
        stamp(r.submitted_at),
        surveyById.get(r.survey_id)?.title ?? "",
        p?.full_name ?? "",
        batchOf(r.ambassador_id),
        r.status,
        r.respondent_name ?? "",
        r.respondent_email ?? "",
        r.respondent_phone ?? "",
      ];
    });

  const rosterRows: Cell[][] = [...profiles]
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((p) => [
      p.full_name,
      p.email,
      p.phone ?? "",
      p.referral_code,
      p.city ?? "",
      p.college ?? "",
      cohortLabel("batch", p.batch ?? ""),
      p.status,
      day(p.activated_at ?? p.created_at),
    ]);

  const stipend = `Stipend (${STIPEND_MIN_COMPLETION_PCT}% + ${STIPEND_MIN_DOWNLOADS} downloads)`;

  // ─── Everyone, every run, one row each ────────────────────────────────────
  //
  // The sheet the workbook opens on. Downloads come straight from the counted
  // conversions, so suspended and invited people get theirs too. Tasks and
  // stipend come from the same per-run measure as the sheets below, which only
  // measures active ambassadors — for anyone else those cells are blank, not
  // zero, because nobody was asking them to do the work.

  const downloadsByRun = new Map<number, Map<string, number>>(
    versions.map((v) => [v.id, new Map()]),
  );
  const lastDownloadOf = new Map<string, string>();
  for (const d of conversions) {
    if (d.status !== "counted") continue;
    const run = downloadsByRun.get(d.version);
    if (run) run.set(d.ambassador_id, (run.get(d.ambassador_id) ?? 0) + 1);
    if (d.converted_at) {
      const seen = lastDownloadOf.get(d.ambassador_id);
      if (!seen || d.converted_at > seen) lastDownloadOf.set(d.ambassador_id, d.converted_at);
    }
  }
  const measuredByRun = new Map(
    perVersion.map(({ version: v, data }) => [
      v.id,
      new Map(data.ranked.map((row) => [row.id, row])),
    ]),
  );

  const statusWord = (status: string) =>
    status === "active" ? "Active" : status.charAt(0).toUpperCase() + status.slice(1);

  const peopleRows: Cell[][] = [...profiles]
    .map((p) => {
      let open = 0;
      let approved = 0;
      let downloads = 0;
      let measured = false;
      const eligibleIn: string[] = [];
      const perRun: Cell[] = [];

      for (const v of versions) {
        const row = measuredByRun.get(v.id)?.get(p.id);
        const runDownloads = downloadsByRun.get(v.id)?.get(p.id) ?? 0;
        downloads += runDownloads;
        if (row) {
          measured = true;
          open += row.total;
          approved += row.approved;
          if (row.eligible) eligibleIn.push(v.label);
        }
        perRun.push(
          row ? row.total : "",
          row ? row.approved : "",
          row && row.total > 0 ? row.completion : "",
          runDownloads,
          !row ? "" : row.total === 0 ? "No tasks" : row.eligible ? "Eligible" : "Not met",
        );
      }

      return {
        sortKey: downloads,
        name: p.full_name,
        cells: [
          p.full_name,
          p.email,
          p.phone ?? "",
          p.referral_code,
          statusWord(p.status),
          p.city ?? "",
          p.college ?? "",
          cohortLabel("batch", p.batch ?? ""),
          day(p.activated_at ?? p.created_at),
          ...perRun,
          measured ? open : "",
          measured ? approved : "",
          measured && open > 0 ? pct(approved, open) : "",
          downloads,
          eligibleIn.length ? eligibleIn.join(", ") : measured ? "None" : "",
          lastDownloadOf.has(p.id) ? day(lastDownloadOf.get(p.id)) : "",
        ] as Cell[],
      };
    })
    .sort((a, b) => b.sortKey - a.sortKey || a.name.localeCompare(b.name))
    .map((row) => row.cells);

  const peopleHeader = [
    "Name",
    "Email",
    "Phone",
    "Referral code",
    "Status",
    "City",
    "College/Office",
    "Batch",
    "Joined on",
    ...versions.flatMap((v) => [
      `${v.label} tasks open`,
      `${v.label} tasks approved`,
      `${v.label} completion %`,
      `${v.label} downloads`,
      `${v.label} ${stipend}`,
    ]),
    "Total tasks open",
    "Total tasks approved",
    "Overall completion %",
    "Total downloads",
    "Stipend eligible in",
    "Last download",
  ];

  // ─── The current run on its own ───────────────────────────────────────────
  //
  // The sheet the workbook opens on: just the run in progress (V3 today), one
  // row per person, with exactly why each one is or is not stipend-eligible.
  // Picked by `isActive`, not by name, so V4 takes its place when it opens.

  //
  // Measured exactly as the Analytics page and the stipend check measure it —
  // by the `version` column, with no time window — so every task carried into
  // this run counts (all 24 in V3, not just the one campaign started in it).
  // Eligibility in this sheet therefore matches what the app shows.
  const current = versions.find((v) => v.isActive) ?? versions[versions.length - 1];
  const currentMeasured = current
    ? new Map(
        (
          await getCompletionByAmbassador(supabase, {
            cohort,
            period,
            version: current.id,
          })
        ).ranked.map((row) => [row.id, row]),
      )
    : undefined;
  const currentDownloads = current ? downloadsByRun.get(current.id) : undefined;

  // V3's two routes to the stipend, in the exports only — the app's own
  // stipend check is unchanged:
  //   tasks route      80%+ completion and 20+ downloads
  //   downloads route  30+ downloads, whatever the completion
  const DOWNLOADS_ONLY_ROUTE = STIPEND_DOWNLOADS_ONLY;
  const TASKS_ROUTE = STIPEND_TASKS_ROUTE_DOWNLOADS;

  const currentRows: Cell[][] = [...profiles]
    .map((p) => {
      const row = currentMeasured?.get(p.id);
      const downloads = currentDownloads?.get(p.id) ?? 0;
      const completionMet = row ? row.completion >= STIPEND_MIN_COMPLETION_PCT : false;
      const downloadsMet = downloads >= TASKS_ROUTE;

      let standing: string;
      let missing: string;
      if (!row) {
        standing = "Not measured";
        missing = `Account is ${p.status}`;
      } else if (row.total === 0 && !row.eligible) {
        standing = "No tasks yet";
        missing = "No tasks open to them yet";
      } else if (row.eligibleBy === "tasks") {
        standing = "Eligible";
        missing = "";
      } else if (row.eligibleBy === "downloads") {
        standing = `Eligible (${DOWNLOADS_ONLY_ROUTE}+ downloads)`;
        missing = "";
      } else {
        standing = "Not met";
        missing = completionMet
          ? `${TASKS_ROUTE - downloads} more downloads (has ${STIPEND_MIN_COMPLETION_PCT}%+ completion)`
          : `completion ${row.completion}% (needs ${STIPEND_MIN_COMPLETION_PCT}%)` +
            (downloadsMet ? "" : ` and ${TASKS_ROUTE - downloads} more downloads`) +
            ` — or ${DOWNLOADS_ONLY_ROUTE - downloads} more downloads to reach ${DOWNLOADS_ONLY_ROUTE}`;
      }

      const rank = standing.startsWith("Eligible")
        ? standing === "Eligible"
          ? 0
          : 1
        : standing === "Not met"
          ? 2
          : standing === "No tasks yet"
            ? 3
            : 4;

      return {
        rank,
        completion: row?.completion ?? -1,
        downloads,
        name: p.full_name,
        cells: [
          p.full_name,
          p.email,
          p.phone ?? "",
          p.referral_code,
          statusWord(p.status),
          p.city ?? "",
          p.college ?? "",
          cohortLabel("batch", p.batch ?? ""),
          day(p.activated_at ?? p.created_at),
          row ? row.total : "",
          row ? row.approved : "",
          row ? row.surveysDone : "",
          row ? row.surveysTotal : "",
          row ? row.sentBack : "",
          row ? row.pending : "",
          row ? row.rejected : "",
          row && row.total > 0 ? row.completion : "",
          row ? (completionMet ? "Yes" : "No") : "",
          downloads,
          downloadsMet ? "Yes" : "No",
          standing.startsWith("Eligible") ? "Eligible" : standing,
          standing === "Eligible"
            ? "Tasks + downloads"
            : standing.startsWith("Eligible")
              ? `${DOWNLOADS_ONLY_ROUTE}+ downloads`
              : "",
          missing,
          lastDownloadOf.has(p.id) ? day(lastDownloadOf.get(p.id)) : "",
        ] as Cell[],
      };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.completion - a.completion ||
        b.downloads - a.downloads ||
        a.name.localeCompare(b.name),
    )
    .map((row) => row.cells);

  const currentLabel = current?.label ?? "Current";
  const currentHeader = [
    "Name",
    "Email",
    "Phone",
    "Referral code",
    "Status",
    "City",
    "College/Office",
    "Batch",
    "Joined on",
    "Tasks open",
    "Tasks approved",
    "Surveys done",
    "Surveys open",
    "Tasks sent back",
    "Tasks pending",
    "Rejections (uploads)",
    "Completion %",
    `Completion ≥ ${STIPEND_MIN_COMPLETION_PCT}%`,
    "Downloads",
    `Downloads ≥ ${TASKS_ROUTE}`,
    "Stipend eligibility",
    `Eligibility route (${STIPEND_MIN_COMPLETION_PCT}% + ${TASKS_ROUTE} downloads, or ${DOWNLOADS_ONLY_ROUTE}+ downloads)`,
    "What's missing",
    "Last download (any version)",
  ];

  const sheets: WorkbookSheet[] = [
    { name: `${currentLabel} only (current)`, header: currentHeader, rows: currentRows },
    { name: "Everyone - all versions", header: peopleHeader, rows: peopleRows },
    {
      name: "Summary by version",
      header: [
        "Version",
        "State",
        "Started",
        "Ended",
        "Ambassadors (with tasks or downloads)",
        "Campaigns",
        "Tasks published",
        "Tasks open to ambassadors",
        "Approved tasks",
        "Completion %",
        "Approved submissions",
        "Approval %",
        "Awaiting review",
        "Confirmed downloads",
        "Stipend eligible",
      ],
      rows: summary,
    },
    {
      name: "Batches by version",
      header: [
        "Version",
        "Batch",
        "Ambassadors",
        "Tasks open",
        "Approved",
        "Completion %",
        "Rejections",
        "Downloads",
        "Stipend eligible",
      ],
      rows: batchRows,
    },
    {
      name: "Batch tasks",
      header: ["Version", "Batch", "Campaign", "Approved", "Open", "Completion %"],
      rows: batchTaskRows,
    },
    {
      name: "Ambassadors by version",
      header: [
        "Version",
        "Name",
        "Email",
        "Phone",
        "Referral code",
        "City",
        "College/Office",
        "Batch",
        "Tasks open",
        "Approved",
        "Surveys done",
        "Surveys open",
        "Rejections",
        "Pending",
        "Completion %",
        "Downloads",
        stipend,
      ],
      rows: ambassadorRows,
    },
    {
      name: "Campaigns",
      header: [
        "Version",
        "Campaign",
        "Status",
        "Platform",
        "Phase",
        "Starts",
        "Ends",
        "Tasks",
        "Submissions",
        "Approved",
      ],
      rows: campaignRows,
    },
    {
      name: "Tasks",
      header: [
        "Version",
        "Campaign",
        "Task",
        "Platform",
        "Points",
        "Required",
        "Submissions",
        "Approved (people)",
        "Rejected",
        "Pending",
      ],
      rows: taskRows,
    },
    {
      name: "Submissions",
      header: [
        "Version",
        "Uploaded (IST)",
        "Ambassador",
        "Email",
        "Batch",
        "Campaign",
        "Task",
        "Status",
        "Attempt",
        "Reject reason",
        "Reviewed (IST)",
      ],
      rows: submissionRows,
    },
    {
      name: "Downloads",
      header: [
        "Version",
        "Converted (IST)",
        "Ambassador",
        "Email",
        "Batch",
        "Code",
        "Status",
        "Source",
      ],
      rows: downloadRows,
    },
    {
      name: "Surveys",
      header: ["Version", "Survey", "Status", "Created", "Responses", "Valid", "Other"],
      rows: surveyRows,
    },
    {
      name: "Survey responses",
      header: [
        "Version",
        "Submitted (IST)",
        "Survey",
        "Ambassador",
        "Batch",
        "Status",
        "Respondent name",
        "Respondent email",
        "Respondent phone",
      ],
      rows: responseRows,
    },
    {
      name: "All ambassadors",
      header: [
        "Name",
        "Email",
        "Phone",
        "Referral code",
        "City",
        "College/Office",
        "Batch",
        "Status",
        "Joined on",
      ],
      rows: rosterRows,
    },
  ];

  const now = new Date().toISOString();
  const filename = `dailymattr-all-data-${day(now)}-${timeFormat.format(new Date(now)).replace(":", "")}.xlsx`;

  return xlsxWorkbookResponse(filename, sheets);
}
