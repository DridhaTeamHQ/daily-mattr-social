import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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
      supabase.from("profiles").select("role, status"),
      supabase.from("submissions").select("status"),
      supabase.from("campaigns").select("status"),
      supabase.from("surveys").select("status"),
      supabase.from("point_ledger").select("delta"),
      supabase
        .from("survey_responses")
        .select("id", { count: "exact", head: true })
        .eq("status", "valid"),
      supabase
        .from("referral_conversions")
        .select("id", { count: "exact", head: true })
        .eq("status", "counted"),
    ]);

  const amb = (profiles.data ?? []).filter((p) => p.role === "ambassador");
  const subs = submissions.data ?? [];
  const camps = campaigns.data ?? [];
  const survs = surveys.data ?? [];
  const deltas = (ledger.data ?? []).map((r) => r.delta);

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

  const [{ data: profiles }, { data: ledger }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, college, status, referral_code, created_at")
      .eq("role", "ambassador")
      .order("created_at", { ascending: false }),
    // `ambassador_points()` is revoked from `authenticated` by 0007, so totals
    // are summed here instead. Fine at cohort scale; revisit past ~50k rows.
    supabase.from("point_ledger").select("ambassador_id, delta"),
  ]);

  const totals = new Map<string, number>();
  for (const row of ledger ?? []) {
    totals.set(row.ambassador_id, (totals.get(row.ambassador_id) ?? 0) + row.delta);
  }

  return (profiles ?? []).map((p) => ({ ...p, points: totals.get(p.id) ?? 0 }));
}

// ─── Review queue ───────────────────────────────────────────────────────────

export type ReviewItem = {
  id: string;
  status: Enums<"submission_status">;
  attempt: number;
  uploaded_at: string;
  screenshot_path: string;
  signedUrl: string | null;
  checks: unknown;
  ai_confidence: number | null;
  ai_model: string | null;
  ambassador: { id: string; full_name: string; college: string | null };
  task: { id: string; type: Enums<"task_type">; points: number };
  campaign: { id: string; title: string; expected_handle: string };
};

export async function getReviewQueue(
  status: "open" | "all" = "open",
): Promise<ReviewItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("submissions")
    .select(
      "id, status, attempt, uploaded_at, screenshot_path, checks, ai_confidence, ai_model, ambassador_id, campaign_task_id, profiles!submissions_ambassador_id_fkey(id, full_name, college), campaign_tasks(id, type, points, campaigns(id, title, expected_handle))",
    )
    .order("uploaded_at", { ascending: true });

  if (status === "open") {
    query = query.in("status", ["pending", "needs_review"]);
  }

  const { data } = await query;
  if (!data?.length) return [];

  // Screenshots live in a private bucket; hand out short-lived URLs only.
  const paths = data.map((r) => r.screenshot_path);
  const { data: signed } = await supabase.storage
    .from("screenshots")
    .createSignedUrls(paths, 60 * 10);

  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path ?? "", s.signedUrl]),
  );

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
        signedUrl: urlByPath.get(row.screenshot_path) ?? null,
        checks: row.checks,
        ai_confidence: row.ai_confidence,
        ai_model: row.ai_model,
        ambassador: {
          id: person.id,
          full_name: person.full_name,
          college: person.college,
        },
        task: { id: task.id, type: task.type, points: task.points },
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

export type AdminCampaign = Tables<"campaigns"> & {
  tasks: Tables<"campaign_tasks">[];
  submissionCount: number;
};

export async function getAdminCampaigns(): Promise<AdminCampaign[]> {
  const supabase = await createClient();

  const [{ data: campaigns }, { data: subs }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, campaign_tasks(*)")
      .order("created_at", { ascending: false }),
    supabase.from("submissions").select("campaign_task_id"),
  ]);

  const perTask = new Map<string, number>();
  for (const s of subs ?? []) {
    perTask.set(s.campaign_task_id, (perTask.get(s.campaign_task_id) ?? 0) + 1);
  }

  return (campaigns ?? []).map((c) => {
    const tasks = [...(c.campaign_tasks ?? [])].sort(
      (a, b) => a.order_index - b.order_index,
    );
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
      supabase
        .from("point_ledger")
        .select("ambassador_id, delta")
        .eq("reason", "referral"),
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
