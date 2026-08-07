import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { earningRoute } from "@/lib/admin/participation";
import { readAll } from "@/lib/admin/read-all";
import type { CohortIds } from "@/lib/admin/scope";
import type { Enums, Tables } from "@/lib/database.types";

/**
 * Admin read models.
 *
 * These use the ordinary RLS client, not the service-role one. Every admin
 * table policy is `using (public.is_admin())`, so the database is doing the
 * authorization — a non-admin session simply sees nothing. `requireAdmin()`
 * exists to give them a redirect instead of an empty page, not to be the
 * security boundary.
 */

export async function requireAdmin(): Promise<Tables<"profiles">> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.status !== "active") {
    redirect("/dashboard");
  }

  return profile;
}

// ─── Overview ───────────────────────────────────────────────────────────────

export type AdminOverview = {
  ambassadors: { active: number; invited: number; suspended: number };
  queue: { pending: number; needsReview: number };
  campaigns: { live: number; draft: number; ended: number };
  surveys: { live: number; draft: number; closed: number };
  points: { issued: number; revoked: number };
  responses: number;
  referrals: number;
};

export async function getOverview(): Promise<AdminOverview> {
  const supabase = await createClient();

  const [profiles, submissions, campaigns, surveys, ledger, responses, refs] =
    await Promise.all([
      readAll<{ role: string; status: string }>(
        (from, to) =>
          supabase
            .from("profiles")
            .select("role, status")
            .order("id")
            .range(from, to),
        "overview.profiles",
      ),
      readAll<{ status: string }>(
        (from, to) =>
          supabase.from("submissions").select("status").order("id").range(from, to),
        "overview.submissions",
      ),
      supabase.from("campaigns").select("status"),
      supabase.from("surveys").select("status"),
      readAll<{ delta: number }>(
        (from, to) =>
          supabase.from("point_ledger").select("delta").order("id").range(from, to),
        "overview.ledger",
      ),
      supabase
        .from("survey_responses")
        .select("id", { count: "exact", head: true })
        .eq("status", "valid"),
      supabase
        .from("referral_conversions")
        .select("id", { count: "exact", head: true })
        .eq("status", "counted"),
    ]);

  const amb = profiles.filter((p) => p.role === "ambassador");
  const subs = submissions;
  const camps = campaigns.data ?? [];
  const survs = surveys.data ?? [];
  const deltas = ledger.map((r) => r.delta);

  return {
    ambassadors: {
      active: amb.filter((p) => p.status === "active").length,
      invited: amb.filter((p) => p.status === "invited").length,
      suspended: amb.filter((p) => p.status === "suspended").length,
    },
    queue: {
      pending: subs.filter((s) => s.status === "pending").length,
      needsReview: subs.filter((s) => s.status === "needs_review").length,
    },
    campaigns: {
      live: camps.filter((c) => c.status === "live").length,
      draft: camps.filter((c) => c.status === "draft").length,
      ended: camps.filter((c) => c.status === "ended").length,
    },
    surveys: {
      live: survs.filter((s) => s.status === "live").length,
      draft: survs.filter((s) => s.status === "draft").length,
      closed: survs.filter((s) => s.status === "closed").length,
    },
    points: {
      issued: deltas.filter((d) => d > 0).reduce((a, b) => a + b, 0),
      revoked: deltas.filter((d) => d < 0).reduce((a, b) => a + b, 0),
    },
    responses: responses.count ?? 0,
    referrals: refs.count ?? 0,
  };
}

// ─── Ambassadors ────────────────────────────────────────────────────────────

export type AmbassadorRow = {
  city: string | null;
  batch: string | null;
  id: string;
  full_name: string;
  email: string;
  college: string | null;
  status: Enums<"user_status">;
  referral_code: string;
  points: number;
  created_at: string;
};

export async function getAmbassadors(): Promise<AmbassadorRow[]> {
  const supabase = await createClient();

  const [profiles, ledger] = await Promise.all([
    readAll<Omit<AmbassadorRow, "points">>(
      (from, to) =>
        supabase
          .from("profiles")
          .select(
            "id, full_name, email, college, city, batch, status, referral_code, created_at",
          )
          .eq("role", "ambassador")
          .order("created_at", { ascending: false })
          // A second key, because `created_at` is not unique — two ambassadors
          // added in the same second could otherwise swap places between
          // pages, which is how a paged read loses one and repeats another.
          .order("id")
          .range(from, to),
      "ambassadors.profiles",
    ),
    // `ambassador_points()` is revoked from `authenticated` by 0007, so totals
    // are summed here instead. Fine at cohort scale; revisit past ~50k rows.
    readAll<{ ambassador_id: string; delta: number }>(
      (from, to) =>
        supabase
          .from("point_ledger")
          .select("ambassador_id, delta")
          .order("id")
          .range(from, to),
      "ambassadors.ledger",
    ),
  ]);

  const totals = new Map<string, number>();
  for (const row of ledger ?? []) {
    totals.set(row.ambassador_id, (totals.get(row.ambassador_id) ?? 0) + row.delta);
  }

  return (profiles ?? []).map((p) => ({ ...p, points: totals.get(p.id) ?? 0 }));
}

/**
 * What a task is called, wherever it came from.
 *
 * A task is either one of the four Instagram enum actions or a row in the
 * library. Every caller used to index a hard-coded map with `type`, which is
 * null for library tasks — so a Reddit comment rendered as `undefined`.
 */
export const ENUM_TASK_LABEL: Record<string, string> = {
  like: "Like the reel",
  comment: "Leave a comment",
  share: "Share it",
  story: "Post to story",
};

export function taskLabel(task: {
  type: string | null;
  label_override?: string | null;
  task_library?: { label: string } | null;
}): string {
  return (
    task.label_override ??
    task.task_library?.label ??
    (task.type ? (ENUM_TASK_LABEL[task.type] ?? task.type) : "Task")
  );
}

export function taskPlatform(task: {
  type: string | null;
  platform?: string | null;
  task_library?: { platform: string | null } | null;
}): string | null {
  // An enum task is an Instagram action by definition.
  return task.platform ?? task.task_library?.platform ?? (task.type ? "Instagram" : null);
}

// ─── Review queue ───────────────────────────────────────────────────────────

export type ReviewItem = {
  id: string;
  status: Enums<"submission_status">;
  attempt: number;
  uploaded_at: string;
  screenshot_path: string | null;
  signedUrl: string | null;
  /** Set instead of a screenshot when the task asks for a link or an answer. */
  proof_url: string | null;
  proof_text: string | null;
  checks: unknown;
  ai_confidence: number | null;
  ai_model: string | null;
  ambassador: { id: string; full_name: string; college: string | null };
  task: {
    id: string;
    type: Enums<"task_type"> | null;
    points: number;
    label: string;
    platform: string | null;
  };
  campaign: { id: string; title: string; expected_handle: string };
};

export async function getReviewQueue(
  status: "open" | "all" = "open",
): Promise<ReviewItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("submissions")
    .select(
      "id, status, attempt, uploaded_at, screenshot_path, proof_url, proof_text, checks, ai_confidence, ai_model, ambassador_id, campaign_task_id, profiles!submissions_ambassador_id_fkey(id, full_name, college), campaign_tasks(id, type, points, label_override, platform, task_library(label, platform), campaigns(id, title, expected_handle))",
    )
    .order("uploaded_at", { ascending: true });

  if (status === "open") {
    query = query.in("status", ["pending", "needs_review"]);
  }

  const { data } = await query;
  if (!data?.length) return [];

  // Screenshots live in a private bucket; hand out short-lived URLs only.
  // Link and text submissions have no path at all, so they are filtered out
  // before signing — passing a null through would fail the whole batch.
  const paths = data
    .map((r) => r.screenshot_path)
    .filter((path): path is string => Boolean(path));
  const { data: signed } = await supabase.storage
    .from("screenshots")
    .createSignedUrls(paths, 60 * 10);

  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path ?? "", s.signedUrl]),
  );

  const signedFor = (path: string | null) =>
    path ? (urlByPath.get(path) ?? null) : null;

  return data.flatMap((row) => {
    const task = row.campaign_tasks;
    const campaign = task?.campaigns;
    const person = row.profiles;
    if (!task || !campaign || !person) return [];

    return [
      {
        id: row.id,
        status: row.status,
        attempt: row.attempt,
        uploaded_at: row.uploaded_at,
        screenshot_path: row.screenshot_path,
        signedUrl: signedFor(row.screenshot_path),
        proof_url: row.proof_url,
        proof_text: row.proof_text,
        checks: row.checks,
        ai_confidence: row.ai_confidence,
        ai_model: row.ai_model,
        ambassador: {
          id: person.id,
          full_name: person.full_name,
          college: person.college,
        },
        task: {
          id: task.id,
          type: task.type,
          points: task.points,
          label: taskLabel(task as never),
          platform: taskPlatform(task as never),
        },
        campaign: {
          id: campaign.id,
          title: campaign.title,
          expected_handle: campaign.expected_handle,
        },
      },
    ];
  });
}

// ─── Campaigns ──────────────────────────────────────────────────────────────

export type AdminCampaignTask = Tables<"campaign_tasks"> & {
  label: string;
  platform: string | null;
};

export type AdminCampaign = Tables<"campaigns"> & {
  tasks: AdminCampaignTask[];
  submissionCount: number;
};

export async function getAdminCampaigns(): Promise<AdminCampaign[]> {
  const supabase = await createClient();

  const [{ data: campaigns }, { data: subs }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, campaign_tasks(*, task_library(label, platform))")
      .order("created_at", { ascending: false }),
    supabase.from("submissions").select("campaign_task_id"),
  ]);

  const perTask = new Map<string, number>();
  for (const s of subs ?? []) {
    perTask.set(s.campaign_task_id, (perTask.get(s.campaign_task_id) ?? 0) + 1);
  }

  return (campaigns ?? []).map((c) => {
    const tasks = [...(c.campaign_tasks ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map((t) => ({
        ...t,
        label: taskLabel(t as never),
        platform: taskPlatform(t as never),
      }));
    return {
      ...c,
      tasks,
      submissionCount: tasks.reduce((n, t) => n + (perTask.get(t.id) ?? 0), 0),
    };
  });
}

// ─── Surveys ────────────────────────────────────────────────────────────────

export type AdminSurvey = Tables<"surveys"> & {
  questionCount: number;
  linkCount: number;
  responseCount: number;
};

export async function getAdminSurveys(): Promise<AdminSurvey[]> {
  const supabase = await createClient();

  const [{ data: surveys }, { data: questions }, { data: links }, { data: responses }] =
    await Promise.all([
      supabase.from("surveys").select("*").order("created_at", { ascending: false }),
      supabase.from("survey_questions").select("survey_id"),
      supabase.from("survey_links").select("survey_id"),
      supabase.from("survey_responses").select("survey_id").eq("status", "valid"),
    ]);

  const tally = (rows: { survey_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.survey_id, (m.get(r.survey_id) ?? 0) + 1);
    return m;
  };

  const q = tally(questions);
  const l = tally(links);
  const r = tally(responses);

  return (surveys ?? []).map((s) => ({
    ...s,
    questionCount: q.get(s.id) ?? 0,
    linkCount: l.get(s.id) ?? 0,
    responseCount: r.get(s.id) ?? 0,
  }));
}

// ─── Activity ───────────────────────────────────────────────────────────────

export async function getRecentActivity(limit = 12) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, meta, created_at, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ─── Referrals ──────────────────────────────────────────────────────────────

export type ReferralRow = {
  id: string;
  full_name: string;
  email: string;
  college: string | null;
  referral_code: string;
  status: Enums<"user_status">;
  /** Downloads credited to this code. */
  confirmed: number;
  /** Voided after the fact — kept visible so a drop in totals is explainable. */
  voided: number;
  lastConversion: string | null;
  /** Points actually paid out for referrals, from the ledger. */
  pointsPaid: number;
};

export type ReferralSummary = {
  rows: ReferralRow[];
  totals: {
    confirmed: number;
    voided: number;
    ambassadorsWithAny: number;
    pointsPaid: number;
  };
};

/**
 * Referral performance per ambassador.
 *
 * Everyone is listed, including ambassadors on zero — a referral page that
 * hides the people who haven't converted anyone is a page that can't tell you
 * who needs help.
 */
export async function getReferralSummary(): Promise<ReferralSummary> {
  const supabase = await createClient();

  const [{ data: profiles }, { data: conversions }, { data: ledger }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, college, referral_code, status")
        .eq("role", "ambassador")
        .order("full_name", { ascending: true }),
      supabase
        .from("referral_conversions")
        .select("ambassador_id, status, converted_at"),
      // Not `.eq("reason", "referral")`: a reversal is written with reason
      // 'revoke', so filtering on the label counted every credit and dropped
      // every row that took one back. See earningRoute.
      supabase
        .from("point_ledger")
        .select("ambassador_id, delta, reason, source_type"),
    ]);

  const counted = new Map<string, number>();
  const voided = new Map<string, number>();
  const last = new Map<string, string>();

  for (const c of conversions ?? []) {
    const bucket = c.status === "counted" ? counted : voided;
    bucket.set(c.ambassador_id, (bucket.get(c.ambassador_id) ?? 0) + 1);

    if (c.status === "counted") {
      const seen = last.get(c.ambassador_id);
      if (!seen || c.converted_at > seen) last.set(c.ambassador_id, c.converted_at);
    }
  }

  const paid = new Map<string, number>();
  for (const l of ledger ?? []) {
    if (earningRoute(l) !== "referral") continue;
    paid.set(l.ambassador_id, (paid.get(l.ambassador_id) ?? 0) + l.delta);
  }

  const rows: ReferralRow[] = (profiles ?? []).map((p) => ({
    ...p,
    confirmed: counted.get(p.id) ?? 0,
    voided: voided.get(p.id) ?? 0,
    lastConversion: last.get(p.id) ?? null,
    pointsPaid: paid.get(p.id) ?? 0,
  }));

  // Best performers first — the ranking is the point of the page.
  rows.sort((a, b) => b.confirmed - a.confirmed || a.full_name.localeCompare(b.full_name));

  return {
    rows,
    totals: {
      confirmed: rows.reduce((n, r) => n + r.confirmed, 0),
      voided: rows.reduce((n, r) => n + r.voided, 0),
      ambassadorsWithAny: rows.filter((r) => r.confirmed > 0).length,
      pointsPaid: rows.reduce((n, r) => n + r.pointsPaid, 0),
    },
  };
}

// ─── Survey responses ───────────────────────────────────────────────────────

export type ResponseAnswer = {
  questionId: string;
  prompt: string;
  type: Enums<"question_type">;
  /** Already flattened for display — arrays joined, numbers stringified. */
  answer: string;
};

export type SurveyResponseRow = {
  id: string;
  status: Enums<"response_status">;
  submittedAt: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  flagReason: string | null;
  ambassador: string;
  answers: ResponseAnswer[];
};

export type SurveyWithResponses = {
  survey: Tables<"surveys">;
  questions: Tables<"survey_questions">[];
  responses: SurveyResponseRow[];
  counts: { valid: number; duplicate: number; flagged: number; rejected: number };
};

/** Renders any stored answer shape as something a person can read. */
function readable(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function getSurveyResponses(
  surveyId: string,
): Promise<SurveyWithResponses | null> {
  const supabase = await createClient();

  const { data: survey } = await supabase
    .from("surveys")
    .select("*")
    .eq("id", surveyId)
    .maybeSingle();
  if (!survey) return null;

  const [{ data: questions }, responses] = await Promise.all([
    supabase
      .from("survey_questions")
      .select("*")
      .eq("survey_id", surveyId)
      .order("order_index", { ascending: true }),
    readAll<{
      id: string;
      status: Enums<"response_status">;
      submitted_at: string;
      respondent_name: string | null;
      respondent_email: string | null;
      respondent_phone: string | null;
      flag_reason: string | null;
      profiles: { full_name: string } | null;
    }>(
      (from, to) =>
        supabase
          .from("survey_responses")
          .select(
            "id, status, submitted_at, respondent_name, respondent_email, respondent_phone, flag_reason, profiles(full_name)",
          )
          .eq("survey_id", surveyId)
          .order("submitted_at", { ascending: false })
          // submitted_at is not unique — two responses in the same millisecond
          // could otherwise swap between pages, losing one and repeating another.
          .order("id")
          .range(from, to),
      "surveyResponses.responses",
    ),
  ]);

  /**
   * Answers are filtered through their parent, not through a list of ids.
   *
   * This was `.in("response_id", ids)`. At 422 responses that is 422 uuids in
   * a query string — a 15,600-character URL, which the server refuses. The
   * error was discarded (only `data` was destructured), so `answers` came back
   * null and every question on the page rendered "Nobody has answered this one
   * yet" underneath a header that said 422 responses. It broke at roughly 400
   * responses, which this programme reaches on a single survey.
   *
   * An embedded `!inner` filter asks the database the question directly and
   * the URL stays one constant length whatever the response count.
   */
  const answers = await readAll<{
    response_id: string;
    question_id: string;
    value: unknown;
  }>(
    (from, to) =>
      supabase
        .from("survey_answers")
        .select("response_id, question_id, value, survey_responses!inner(survey_id)")
        .eq("survey_responses.survey_id", surveyId)
        .order("response_id")
        .order("question_id")
        .range(from, to),
    "surveyResponses.answers",
  );

  const byResponse = new Map<string, Map<string, unknown>>();
  for (const a of answers ?? []) {
    if (!byResponse.has(a.response_id)) byResponse.set(a.response_id, new Map());
    byResponse.get(a.response_id)!.set(a.question_id, a.value);
  }

  const ordered = questions ?? [];

  const rows: SurveyResponseRow[] = (responses ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    submittedAt: r.submitted_at,
    name: r.respondent_name,
    email: r.respondent_email,
    phone: r.respondent_phone,
    flagReason: r.flag_reason,
    ambassador: r.profiles?.full_name ?? "—",
    // Every question, in order, even the ones this person skipped — a gap is
    // itself a finding, and hiding it makes responses look inconsistent.
    answers: ordered.map((q) => ({
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      answer: readable(byResponse.get(r.id)?.get(q.id)),
    })),
  }));

  return {
    survey,
    questions: ordered,
    responses: rows,
    counts: {
      valid: rows.filter((r) => r.status === "valid").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
      flagged: rows.filter((r) => r.status === "flagged").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
    },
  };
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export type DayPoint = { day: string; value: number };
export type NamedValue = { label: string; value: number; sub?: string };

export type Analytics = {
  pointsByDay: DayPoint[];
  submissionsByStatus: NamedValue[];
  topAmbassadors: NamedValue[];
  responsesBySurvey: NamedValue[];
  earningsBySource: NamedValue[];
  totals: {
    issued: number;
    reversed: number;
    activeEarners: number;
    /** Share of reviewed submissions that were approved. */
    approvalRate: number | null;
  };
};

const DAY_MS = 86_400_000;

/** ISO date (YYYY-MM-DD) in IST, matching how streaks are counted. */
function istDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3600_000)
    .toISOString()
    .slice(0, 10);
}

export async function getAnalytics(
  days = 30,
  /** Restrict every figure to one cohort. Null is the whole programme. */
  scope: CohortIds = null,
): Promise<Analytics> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * DAY_MS).toISOString();

  const [ledgerRows, subsRows, profileRows, surveysRes, responseRows] =
    await Promise.all([
      readAll<{
        ambassador_id: string;
        delta: number;
        reason: string;
        created_at: string;
      }>(
        (from, to) =>
          supabase
            .from("point_ledger")
            .select("ambassador_id, delta, reason, created_at")
            .gte("created_at", since)
            .order("id")
            .range(from, to),
        "analytics.ledger",
      ),
      readAll<{ ambassador_id: string; status: string }>(
        (from, to) =>
          supabase
            .from("submissions")
            .select("ambassador_id, status")
            .order("id")
            .range(from, to),
        "analytics.submissions",
      ),
      readAll<{ id: string; full_name: string; college: string | null }>(
        (from, to) =>
          supabase
            .from("profiles")
            .select("id, full_name, college")
            .eq("role", "ambassador")
            .order("id")
            .range(from, to),
        "analytics.profiles",
      ),
      supabase.from("surveys").select("id, title"),
      readAll<{ ambassador_id: string; survey_id: string; status: string }>(
        (from, to) =>
          supabase
            .from("survey_responses")
            .select("ambassador_id, survey_id, status")
            .order("id")
            .range(from, to),
        "analytics.responses",
      ),
    ]);

  const mine = <T extends { ambassador_id: string }>(list: T[] | null) =>
    (list ?? []).filter((row) => !scope || scope.has(row.ambassador_id));

  const ledger = mine(ledgerRows);
  const names = new Map(
    profileRows.map((p) => [p.id, { name: p.full_name, college: p.college }]),
  );

  // ── Points per day ────────────────────────────────────────────────────────
  // Every day in the window is present, including the empty ones. Dropping
  // zero days silently compresses a quiet week into a busy-looking line.
  const perDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    perDay.set(new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10), 0);
  }
  for (const row of ledger) {
    if (row.delta <= 0) continue;
    const key = istDay(row.created_at);
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + row.delta);
  }

  // ── Where points came from ────────────────────────────────────────────────
  const REASON_LABEL: Record<string, string> = {
    survey_response: "Surveys",
    instagram_task: "Campaigns",
    referral: "Referrals",
    manual_adjust: "Manual",
  };
  const bySource = new Map<string, number>();
  for (const row of ledger) {
    if (row.delta <= 0) continue;
    const label = REASON_LABEL[row.reason] ?? "Other";
    bySource.set(label, (bySource.get(label) ?? 0) + row.delta);
  }

  // ── Top ambassadors ───────────────────────────────────────────────────────
  const perAmbassador = new Map<string, number>();
  for (const row of ledger) {
    perAmbassador.set(
      row.ambassador_id,
      (perAmbassador.get(row.ambassador_id) ?? 0) + row.delta,
    );
  }

  const topAmbassadors: NamedValue[] = [...perAmbassador.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, value]) => ({
      label: names.get(id)?.name ?? "Unknown",
      value,
      sub: names.get(id)?.college ?? undefined,
    }));

  // ── Submissions ───────────────────────────────────────────────────────────
  const STATUS_LABEL: Record<string, string> = {
    auto_approved: "Auto-approved",
    approved: "Approved",
    needs_review: "Needs review",
    pending: "Checking",
    rejected: "Rejected",
    revoked: "Revoked",
  };
  const statusCount = new Map<string, number>();
  for (const s of mine(subsRows)) {
    statusCount.set(s.status, (statusCount.get(s.status) ?? 0) + 1);
  }

  const submissionsByStatus: NamedValue[] = Object.keys(STATUS_LABEL)
    .map((key) => ({ label: STATUS_LABEL[key], value: statusCount.get(key) ?? 0 }))
    .filter((row) => row.value > 0);

  const approved =
    (statusCount.get("approved") ?? 0) + (statusCount.get("auto_approved") ?? 0);
  const reviewed = approved + (statusCount.get("rejected") ?? 0);

  // ── Responses per survey ──────────────────────────────────────────────────
  const surveyTitles = new Map(
    (surveysRes.data ?? []).map((s) => [s.id, s.title]),
  );
  const perSurvey = new Map<string, number>();
  for (const r of mine(responseRows)) {
    if (r.status !== "valid") continue;
    perSurvey.set(r.survey_id, (perSurvey.get(r.survey_id) ?? 0) + 1);
  }

  const responsesBySurvey: NamedValue[] = [...surveyTitles.entries()]
    .map(([id, title]) => ({ label: title, value: perSurvey.get(id) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const deltas = ledger.map((r) => r.delta);

  return {
    pointsByDay: [...perDay.entries()].map(([day, value]) => ({ day, value })),
    submissionsByStatus,
    topAmbassadors,
    responsesBySurvey,
    earningsBySource: [...bySource.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    totals: {
      issued: deltas.filter((d) => d > 0).reduce((a, b) => a + b, 0),
      reversed: Math.abs(deltas.filter((d) => d < 0).reduce((a, b) => a + b, 0)),
      activeEarners: [...perAmbassador.values()].filter((v) => v > 0).length,
      approvalRate: reviewed > 0 ? approved / reviewed : null,
    },
  };
}

// ─── One ambassador ─────────────────────────────────────────────────────────

export type AmbassadorSubmission = {
  id: string;
  status: Enums<"submission_status">;
  uploadedAt: string;
  points: number;
  taskType: Enums<"task_type"> | null;
  taskLabel: string;
  campaign: string;
};

export type AmbassadorSurveyStat = {
  surveyId: string;
  title: string;
  slug: string;
  clicks: number;
  responses: number;
  duplicates: number;
};

export type AmbassadorDetail = {
  profile: Tables<"profiles">;
  points: {
    total: number;
    earned: number;
    reversed: number;
    rank: number | null;
    cohort: number;
  };
  streak: number;
  pointsByDay: DayPoint[];
  earningsBySource: NamedValue[];
  ledger: {
    id: number;
    delta: number;
    reason: Enums<"ledger_reason">;
    /** What the row paid for. A reversal carries the source it cancels. */
    source_type: string | null;
    note: string | null;
    created_at: string;
  }[];
  surveys: AmbassadorSurveyStat[];
  submissions: AmbassadorSubmission[];
  referrals: {
    counted: number;
    voided: number;
    last: string | null;
    points: number;
  };
};

/**
 * Consecutive days with earnings, counted in IST.
 *
 * `my_streak()` is scoped to `auth.uid()`, so it can only ever answer for the
 * caller. An admin looking at someone else needs the same number computed from
 * that person's rows instead.
 */
function streakFrom(rows: { delta: number; created_at: string }[]): number {
  const days = new Set(
    rows.filter((r) => r.delta > 0).map((r) => istDay(r.created_at)),
  );
  if (days.size === 0) return 0;

  const today = istDay(new Date().toISOString());
  const yesterday = istDay(new Date(Date.now() - DAY_MS).toISOString());

  // A streak that ended before yesterday is over, not merely paused.
  let cursor = days.has(today) ? today : days.has(yesterday) ? yesterday : null;
  if (!cursor) return 0;

  let count = 0;
  while (days.has(cursor)) {
    count++;
    cursor = istDay(new Date(new Date(cursor).getTime() - DAY_MS).toISOString());
  }
  return count;
}

export async function getAmbassadorDetail(
  profileId: string,
  days = 30,
): Promise<AmbassadorDetail | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile || profile.role !== "ambassador") return null;

  const [
    ledgerRes,
    allLedger,
    cohortRows,
    linksRes,
    responsesRes,
    submissionsRes,
    conversionsRes,
  ] = await Promise.all([
    supabase
      .from("point_ledger")
      .select("id, delta, reason, source_type, note, created_at")
      .eq("ambassador_id", profileId)
      .order("created_at", { ascending: false }),
    // Everyone's totals, so this person's rank is a real position in the
    // cohort rather than a number that only makes sense on its own. Paged:
    // truncating this would rank them against the first thousand rows of the
    // ledger and quietly promote them.
    readAll<{ ambassador_id: string; delta: number }>(
      (from, to) =>
        supabase
          .from("point_ledger")
          .select("ambassador_id, delta")
          .order("id")
          .range(from, to),
      "ambassadorDetail.allLedger",
    ),
    readAll<{ id: string }>(
      (from, to) =>
        supabase
          .from("profiles")
          .select("id")
          .eq("role", "ambassador")
          .eq("status", "active")
          .order("id")
          .range(from, to),
      "ambassadorDetail.cohort",
    ),
    supabase
      .from("survey_links")
      .select("id, slug, click_count, surveys(id, title)")
      .eq("ambassador_id", profileId),
    supabase
      .from("survey_responses")
      .select("survey_id, status")
      .eq("ambassador_id", profileId),
    supabase
      .from("submissions")
      .select("id, status, uploaded_at, campaign_tasks(type, points, label_override, platform, task_library(label, platform), campaigns(title))")
      .eq("ambassador_id", profileId)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("referral_conversions")
      .select("status, converted_at")
      .eq("ambassador_id", profileId),
  ]);

  const ledger = ledgerRes.data ?? [];
  const deltas = ledger.map((r) => r.delta);

  // ── Rank within the active cohort ─────────────────────────────────────────
  const activeIds = new Set(cohortRows.map((r) => r.id));
  const totals = new Map<string, number>();
  for (const id of activeIds) totals.set(id, 0);
  for (const row of allLedger) {
    if (!activeIds.has(row.ambassador_id)) continue;
    totals.set(row.ambassador_id, (totals.get(row.ambassador_id) ?? 0) + row.delta);
  }

  const mine = totals.get(profileId) ?? 0;
  const rank = activeIds.has(profileId)
    ? [...totals.values()].filter((v) => v > mine).length + 1
    : null;

  // ── Points per day ────────────────────────────────────────────────────────
  const perDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    perDay.set(new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10), 0);
  }
  for (const row of ledger) {
    if (row.delta <= 0) continue;
    const key = istDay(row.created_at);
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + row.delta);
  }

  const REASON_LABEL: Record<string, string> = {
    survey_response: "Surveys",
    instagram_task: "Campaigns",
    referral: "Referrals",
    manual_adjust: "Manual",
  };
  const bySource = new Map<string, number>();
  for (const row of ledger) {
    if (row.delta <= 0) continue;
    const label = REASON_LABEL[row.reason] ?? "Other";
    bySource.set(label, (bySource.get(label) ?? 0) + row.delta);
  }

  // ── Surveys ───────────────────────────────────────────────────────────────
  const valid = new Map<string, number>();
  const dupes = new Map<string, number>();
  for (const r of responsesRes.data ?? []) {
    const bucket = r.status === "valid" ? valid : dupes;
    bucket.set(r.survey_id, (bucket.get(r.survey_id) ?? 0) + 1);
  }

  const surveys: AmbassadorSurveyStat[] = (linksRes.data ?? []).flatMap((l) =>
    l.surveys
      ? [
          {
            surveyId: l.surveys.id,
            title: l.surveys.title,
            slug: l.slug,
            clicks: l.click_count,
            responses: valid.get(l.surveys.id) ?? 0,
            duplicates: dupes.get(l.surveys.id) ?? 0,
          },
        ]
      : [],
  );
  surveys.sort((a, b) => b.responses - a.responses);

  // ── Submissions ───────────────────────────────────────────────────────────
  const submissions: AmbassadorSubmission[] = (
    submissionsRes.data ?? []
  ).flatMap((s) =>
    s.campaign_tasks
      ? [
          {
            id: s.id,
            status: s.status,
            uploadedAt: s.uploaded_at,
            points: s.campaign_tasks.points,
            taskType: s.campaign_tasks.type,
            taskLabel: taskLabel(s.campaign_tasks as never),
            campaign: s.campaign_tasks.campaigns?.title ?? "-",
          },
        ]
      : [],
  );

  // ── Referrals ─────────────────────────────────────────────────────────────
  const conversions = conversionsRes.data ?? [];
  const counted = conversions.filter((c) => c.status === "counted");
  const convertedDates = counted.map((c) => c.converted_at).sort();

  return {
    profile,
    points: {
      total: deltas.reduce((a, b) => a + b, 0),
      earned: deltas.filter((d) => d > 0).reduce((a, b) => a + b, 0),
      reversed: Math.abs(deltas.filter((d) => d < 0).reduce((a, b) => a + b, 0)),
      rank,
      cohort: activeIds.size,
    },
    streak: streakFrom(ledger),
    pointsByDay: [...perDay.entries()].map(([day, value]) => ({ day, value })),
    earningsBySource: [...bySource.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    ledger,
    surveys,
    submissions,
    referrals: {
      counted: counted.length,
      voided: conversions.length - counted.length,
      last: convertedDates.length ? convertedDates[convertedDates.length - 1] : null,
      points: ledger
        .filter((l) => earningRoute(l) === "referral")
        .reduce((n, l) => n + l.delta, 0),
    },
  };
}

// ─── One campaign ───────────────────────────────────────────────────────────

export type CampaignTaskStat = {
  id: string;
  type: Enums<"task_type"> | null;
  label: string;
  platform: string | null;
  points: number;
  required: boolean;
  submitted: number;
  approved: number;
  rejected: number;
  waiting: number;
  pointsPaid: number;
};

export type CampaignParticipant = {
  id: string;
  name: string;
  college: string | null;
  done: number;
  approved: number;
  pointsEarned: number;
};

export type CampaignDetail = {
  campaign: Tables<"campaigns">;
  tasks: CampaignTaskStat[];
  participants: CampaignParticipant[];
  /** Active ambassadors who have submitted nothing at all. */
  untouched: CampaignParticipant[];
  submissionsByDay: DayPoint[];
  statusBreakdown: NamedValue[];
  totals: {
    submissions: number;
    pointsPaid: number;
    pointsAvailable: number;
    participants: number;
    cohort: number;
    approvalRate: number | null;
  };
};

export async function getCampaignDetail(
  campaignId: string,
  days = 30,
): Promise<CampaignDetail | null> {
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return null;

  const { data: tasks } = await supabase
    .from("campaign_tasks")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("order_index", { ascending: true });

  const taskIds = (tasks ?? []).map((t) => t.id);

  const [submissionsRes, cohortRes, ledgerRes] = await Promise.all([
    taskIds.length
      ? supabase
          .from("submissions")
          .select("id, campaign_task_id, ambassador_id, status, uploaded_at, profiles!submissions_ambassador_id_fkey(full_name, college)")
          .in("campaign_task_id", taskIds)
      : Promise.resolve({ data: [] as never[] }),
    readAll<{ id: string; full_name: string; college: string | null }>(
      (from, to) =>
        supabase
          .from("profiles")
          .select("id, full_name, college")
          .eq("role", "ambassador")
          .eq("status", "active")
          .order("id")
          .range(from, to),
      "campaignDetail.cohort",
    ),
    // Points actually paid for this campaign, read from the ledger rather than
    // inferred from task values — an approval that was later revoked must not
    // still be counted as paid.
    readAll<{
      ambassador_id: string;
      delta: number;
      source_id: string | null;
      source_type: string | null;
    }>(
      (from, to) =>
        supabase
          .from("point_ledger")
          .select("ambassador_id, delta, source_id, source_type")
          .eq("source_type", "submission")
          .order("id")
          .range(from, to),
      "campaignDetail.ledger",
    ),
  ]);

  const submissions = submissionsRes.data ?? [];
  const submissionIds = new Set(submissions.map((s) => s.id));

  const paidBySubmission = new Map<string, number>();
  for (const row of ledgerRes) {
    if (!row.source_id || !submissionIds.has(row.source_id)) continue;
    paidBySubmission.set(
      row.source_id,
      (paidBySubmission.get(row.source_id) ?? 0) + row.delta,
    );
  }

  const APPROVED = new Set(["approved", "auto_approved"]);
  const WAITING = new Set(["pending", "needs_review"]);

  // ── Per task ──────────────────────────────────────────────────────────────
  const taskStats: CampaignTaskStat[] = (tasks ?? []).map((task) => {
    const mine = submissions.filter((s) => s.campaign_task_id === task.id);
    return {
      label: taskLabel(task as never),
      platform: taskPlatform(task as never),
      id: task.id,
      type: task.type,
      points: task.points,
      required: task.required,
      submitted: mine.length,
      approved: mine.filter((s) => APPROVED.has(s.status)).length,
      rejected: mine.filter((s) => s.status === "rejected" || s.status === "revoked").length,
      waiting: mine.filter((s) => WAITING.has(s.status)).length,
      pointsPaid: mine.reduce((n, s) => n + (paidBySubmission.get(s.id) ?? 0), 0),
    };
  });

  // ── Per person ────────────────────────────────────────────────────────────
  const byPerson = new Map<string, CampaignParticipant>();
  for (const s of submissions) {
    const existing = byPerson.get(s.ambassador_id) ?? {
      id: s.ambassador_id,
      name: s.profiles?.full_name ?? "Unknown",
      college: s.profiles?.college ?? null,
      done: 0,
      approved: 0,
      pointsEarned: 0,
    };

    existing.done += 1;
    if (APPROVED.has(s.status)) existing.approved += 1;
    existing.pointsEarned += paidBySubmission.get(s.id) ?? 0;
    byPerson.set(s.ambassador_id, existing);
  }

  const participants = [...byPerson.values()].sort(
    (a, b) => b.pointsEarned - a.pointsEarned || b.done - a.done,
  );

  // Who has done nothing is the actionable half of participation — a list of
  // only the people who took part cannot tell you who to chase.
  const untouched: CampaignParticipant[] = cohortRes
    .filter((p) => !byPerson.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.full_name,
      college: p.college,
      done: 0,
      approved: 0,
      pointsEarned: 0,
    }));

  // ── Over time ─────────────────────────────────────────────────────────────
  const perDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    perDay.set(new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10), 0);
  }
  for (const s of submissions) {
    const key = istDay(s.uploaded_at);
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const STATUS_LABEL: Record<string, string> = {
    auto_approved: "Auto-approved",
    approved: "Approved",
    needs_review: "Needs review",
    pending: "Checking",
    rejected: "Rejected",
    revoked: "Revoked",
  };
  const statusCount = new Map<string, number>();
  for (const s of submissions) {
    statusCount.set(s.status, (statusCount.get(s.status) ?? 0) + 1);
  }

  const approvedTotal = submissions.filter((s) => APPROVED.has(s.status)).length;
  const decided =
    approvedTotal + submissions.filter((s) => s.status === "rejected").length;

  const cohort = cohortRes.length;

  return {
    campaign,
    tasks: taskStats,
    participants,
    untouched,
    submissionsByDay: [...perDay.entries()].map(([day, value]) => ({ day, value })),
    statusBreakdown: Object.keys(STATUS_LABEL)
      .map((key) => ({ label: STATUS_LABEL[key], value: statusCount.get(key) ?? 0 }))
      .filter((row) => row.value > 0),
    totals: {
      submissions: submissions.length,
      pointsPaid: [...paidBySubmission.values()].reduce((a, b) => a + b, 0),
      pointsAvailable: (tasks ?? []).reduce((n, t) => n + t.points, 0),
      participants: byPerson.size,
      cohort,
      approvalRate: decided > 0 ? approvedTotal / decided : null,
    },
  };
}
