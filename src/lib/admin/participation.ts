import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Per-ambassador views of campaign and survey activity.
 *
 * The Campaigns and Surveys sections answer "how is this campaign doing".
 * These answer the transpose — "how is this person doing across campaigns" —
 * which is the question asked when deciding who to chase, and it cannot be
 * read off a per-campaign page without opening every one of them.
 */

/**
 * Which earning route a ledger row belongs to.
 *
 * Attribution goes by `source_type`, never by `reason`. A reversal is written
 * as a compensating row with reason 'revoke' and the SAME source_type as the
 * credit it cancels — so filtering on `reason = 'instagram_task'` counted the
 * credit and silently dropped the row that took it back. Every league table
 * did this, each under a comment promising that revoked work stops counting.
 * One ambassador showed 400 referral points of which 200 had been reversed.
 *
 * Seed rows and anything written before source_type existed carry only a
 * reason, so that is the fallback rather than the rule.
 */
export type EarningRoute = "campaign" | "survey" | "referral";

const ROUTE_BY_SOURCE: Record<string, EarningRoute> = {
  submission: "campaign",
  survey_response: "survey",
  referral_conversion: "referral",
};

const ROUTE_BY_REASON: Record<string, EarningRoute> = {
  instagram_task: "campaign",
  survey_response: "survey",
  referral: "referral",
};

type LedgerRow = { reason: string; source_type: string | null };

export function earningRoute(row: LedgerRow): EarningRoute | null {
  if (row.source_type && ROUTE_BY_SOURCE[row.source_type]) {
    return ROUTE_BY_SOURCE[row.source_type];
  }
  return ROUTE_BY_REASON[row.reason] ?? null;
}

/**
 * Everyone's actual balance, every reason included.
 *
 * The three routes do not add up to what an ambassador holds — a manual
 * adjustment, a streak bonus or a badge award belongs to no route. A league
 * table that sums the routes therefore shows a number that disagrees with the
 * same person's own page, which is worse than showing nothing.
 */
export const getPointsByAmbassador = cache(
  async (): Promise<Map<string, number>> => {
    const db = createAdminClient();
    const { data } = await db
      .from("point_ledger")
      .select("ambassador_id, delta");

    const totals = new Map<string, number>();
    for (const row of data ?? []) {
      totals.set(
        row.ambassador_id,
        (totals.get(row.ambassador_id) ?? 0) + row.delta,
      );
    }
    return totals;
  },
);

export type CampaignParticipation = {
  id: string;
  name: string;
  city: string | null;
  batch: string | null;
  submitted: number;
  approved: number;
  rejected: number;
  waiting: number;
  campaignsTouched: number;
  pointsEarned: number;
};

const APPROVED = new Set(["approved", "auto_approved"]);
const REJECTED = new Set(["rejected", "revoked"]);

export const getCampaignParticipation = cache(
  async (): Promise<{ rows: CampaignParticipation[]; campaigns: number }> => {
    const db = createAdminClient();

    const [{ data: profiles }, { data: submissions }, { data: ledger }, { count }] =
      await Promise.all([
        db
          .from("profiles")
          .select("id, full_name, city, batch")
          .eq("role", "ambassador")
          .eq("status", "active"),
        db
          .from("submissions")
          .select("ambassador_id, status, campaign_tasks(campaign_id)"),
        db
          .from("point_ledger")
          .select("ambassador_id, delta, reason, source_type"),
        db
          .from("campaigns")
          .select("id", { count: "exact", head: true })
          .neq("status", "draft"),
      ]);

    const byPerson = new Map<string, CampaignParticipation>();
    const campaignsSeen = new Map<string, Set<string>>();

    for (const p of profiles ?? []) {
      byPerson.set(p.id, {
        id: p.id,
        name: p.full_name,
        city: p.city,
        batch: p.batch,
        submitted: 0,
        approved: 0,
        rejected: 0,
        waiting: 0,
        campaignsTouched: 0,
        pointsEarned: 0,
      });
      campaignsSeen.set(p.id, new Set());
    }

    for (const s of submissions ?? []) {
      const row = byPerson.get(s.ambassador_id);
      if (!row) continue;

      row.submitted += 1;
      if (APPROVED.has(s.status)) row.approved += 1;
      else if (REJECTED.has(s.status)) row.rejected += 1;
      else row.waiting += 1;

      const campaignId = (s.campaign_tasks as unknown as { campaign_id: string } | null)
        ?.campaign_id;
      if (campaignId) campaignsSeen.get(s.ambassador_id)?.add(campaignId);
    }

    // Points read from the ledger rather than summed from task values, so an
    // approval that was later revoked stops counting — which only works if
    // the reversal is read too. See earningRoute.
    for (const entry of ledger ?? []) {
      if (earningRoute(entry) !== "campaign") continue;
      const row = byPerson.get(entry.ambassador_id);
      if (row) row.pointsEarned += entry.delta;
    }

    for (const [id, set] of campaignsSeen) {
      const row = byPerson.get(id);
      if (row) row.campaignsTouched = set.size;
    }

    return {
      campaigns: count ?? 0,
      rows: [...byPerson.values()].sort(
        (a, b) => b.approved - a.approved || b.submitted - a.submitted,
      ),
    };
  },
);

export type SurveyParticipation = {
  id: string;
  name: string;
  city: string | null;
  batch: string | null;
  links: number;
  clicks: number;
  responses: number;
  flagged: number;
  pointsEarned: number;
  /** Responses per click. Null until they have any clicks to divide by. */
  conversion: number | null;
};

export const getSurveyParticipation = cache(
  async (): Promise<SurveyParticipation[]> => {
    const db = createAdminClient();

    const [{ data: profiles }, { data: links }, { data: responses }, { data: ledger }] =
      await Promise.all([
        db
          .from("profiles")
          .select("id, full_name, city, batch")
          .eq("role", "ambassador")
          .eq("status", "active"),
        db.from("survey_links").select("ambassador_id, click_count"),
        db.from("survey_responses").select("ambassador_id, status"),
        db
          .from("point_ledger")
          .select("ambassador_id, delta, reason, source_type"),
      ]);

    const byPerson = new Map<string, SurveyParticipation>();

    for (const p of profiles ?? []) {
      byPerson.set(p.id, {
        id: p.id,
        name: p.full_name,
        city: p.city,
        batch: p.batch,
        links: 0,
        clicks: 0,
        responses: 0,
        flagged: 0,
        pointsEarned: 0,
        conversion: null,
      });
    }

    for (const link of links ?? []) {
      const row = byPerson.get(link.ambassador_id);
      if (!row) continue;
      row.links += 1;
      row.clicks += link.click_count;
    }

    for (const response of responses ?? []) {
      const row = byPerson.get(response.ambassador_id);
      if (!row) continue;
      if (response.status === "valid") row.responses += 1;
      else row.flagged += 1;
    }

    for (const entry of ledger ?? []) {
      if (earningRoute(entry) !== "survey") continue;
      const row = byPerson.get(entry.ambassador_id);
      if (row) row.pointsEarned += entry.delta;
    }

    return [...byPerson.values()]
      .map((row) => ({
        ...row,
        conversion: row.clicks > 0 ? row.responses / row.clicks : null,
      }))
      .sort((a, b) => b.responses - a.responses || b.clicks - a.clicks);
  },
);

// ─── Per-entity league tables ───────────────────────────────────────────────

export type DownloadLeader = {
  id: string;
  name: string;
  city: string | null;
  batch: string | null;
  downloads: number;
  voided: number;
  pointsEarned: number;
};

/** Every ambassador, ranked by confirmed downloads. */
export const getDownloadLeaders = cache(async (): Promise<DownloadLeader[]> => {
  const db = createAdminClient();

  const [{ data: profiles }, { data: conversions }, { data: ledger }] =
    await Promise.all([
      db
        .from("profiles")
        .select("id, full_name, city, batch")
        .eq("role", "ambassador")
        .eq("status", "active"),
      db.from("referral_conversions").select("ambassador_id, status"),
      db
        .from("point_ledger")
        .select("ambassador_id, delta, reason, source_type"),
    ]);

  const rows = new Map<string, DownloadLeader>();
  for (const p of profiles ?? []) {
    rows.set(p.id, {
      id: p.id,
      name: p.full_name,
      city: p.city,
      batch: p.batch,
      downloads: 0,
      voided: 0,
      pointsEarned: 0,
    });
  }

  for (const c of conversions ?? []) {
    const row = rows.get(c.ambassador_id);
    if (!row) continue;
    if (c.status === "counted") row.downloads += 1;
    else row.voided += 1;
  }

  for (const entry of ledger ?? []) {
    if (earningRoute(entry) !== "referral") continue;
    const row = rows.get(entry.ambassador_id);
    if (row) row.pointsEarned += entry.delta;
  }

  return [...rows.values()].sort((a, b) => b.downloads - a.downloads);
});

export type CampaignTotals = {
  id: string;
  title: string;
  status: string;
  platform: string;
  participants: number;
  submitted: number;
  approved: number;
  waiting: number;
  pointsPaid: number;
};

/** Every campaign with the numbers that say whether it worked. */
export const getCampaignTotals = cache(async (): Promise<CampaignTotals[]> => {
  const db = createAdminClient();

  const [{ data: campaigns }, { data: submissions }, { data: ledger }] =
    await Promise.all([
      db
        .from("campaigns")
        .select("id, title, status, platform, campaign_tasks(id)")
        .order("created_at", { ascending: false }),
      db
        .from("submissions")
        .select("id, ambassador_id, status, campaign_tasks(campaign_id)"),
      db
        .from("point_ledger")
        .select("delta, source_id, reason, source_type"),
    ]);

  // A campaign-task ledger row points at the SUBMISSION it paid for, so the
  // route to a campaign is submission -> task -> campaign. Read from the
  // ledger rather than summing task values, so a revoked approval stops
  // counting.
  const submissionToCampaign = new Map<string, string>();

  const rows = new Map<string, CampaignTotals>();
  const people = new Map<string, Set<string>>();

  for (const c of campaigns ?? []) {
    rows.set(c.id, {
      id: c.id,
      title: c.title,
      status: c.status,
      platform: c.platform,
      participants: 0,
      submitted: 0,
      approved: 0,
      waiting: 0,
      pointsPaid: 0,
    });
    people.set(c.id, new Set());
  }

  for (const s of submissions ?? []) {
    const campaignId = (
      s.campaign_tasks as unknown as { campaign_id: string } | null
    )?.campaign_id;
    const row = campaignId ? rows.get(campaignId) : undefined;
    if (!row || !campaignId) continue;

    submissionToCampaign.set(s.id, campaignId);

    row.submitted += 1;
    people.get(campaignId)?.add(s.ambassador_id);
    if (APPROVED.has(s.status)) row.approved += 1;
    else if (!REJECTED.has(s.status)) row.waiting += 1;
  }

  for (const entry of ledger ?? []) {
    if (earningRoute(entry) !== "campaign") continue;
    const campaignId = entry.source_id
      ? submissionToCampaign.get(entry.source_id)
      : undefined;
    const row = campaignId ? rows.get(campaignId) : undefined;
    if (row) row.pointsPaid += entry.delta;
  }

  for (const [id, set] of people) {
    const row = rows.get(id);
    if (row) row.participants = set.size;
  }

  return [...rows.values()];
});

export type SurveyTotals = {
  id: string;
  title: string;
  status: string;
  links: number;
  clicks: number;
  responses: number;
  flagged: number;
  pointsPaid: number;
};

export const getSurveyTotals = cache(async (): Promise<SurveyTotals[]> => {
  const db = createAdminClient();

  const [{ data: surveys }, { data: links }, { data: responses }] =
    await Promise.all([
      db
        .from("surveys")
        .select("id, title, status, points_per_response")
        .order("created_at", { ascending: false }),
      db.from("survey_links").select("survey_id, click_count"),
      db.from("survey_responses").select("survey_id, status"),
    ]);

  const rows = new Map<string, SurveyTotals>();
  const perResponse = new Map<string, number>();

  for (const s of surveys ?? []) {
    rows.set(s.id, {
      id: s.id,
      title: s.title,
      status: s.status,
      links: 0,
      clicks: 0,
      responses: 0,
      flagged: 0,
      pointsPaid: 0,
    });
    perResponse.set(s.id, s.points_per_response);
  }

  for (const l of links ?? []) {
    const row = rows.get(l.survey_id);
    if (!row) continue;
    row.links += 1;
    row.clicks += l.click_count;
  }

  for (const r of responses ?? []) {
    const row = rows.get(r.survey_id);
    if (!row) continue;
    if (r.status === "valid") row.responses += 1;
    else row.flagged += 1;
  }

  for (const row of rows.values()) {
    row.pointsPaid = row.responses * (perResponse.get(row.id) ?? 0);
  }

  return [...rows.values()];
});

// ─── One survey, broken down by ambassador ──────────────────────────────────

export type SurveyAmbassador = {
  id: string;
  name: string;
  city: string | null;
  batch: string | null;
  slug: string | null;
  clicks: number;
  responses: number;
  flagged: number;
  pointsEarned: number;
  /** Responses per click. Null until there are clicks to divide by. */
  conversion: number | null;
};

/**
 * Who collected what for a single survey.
 *
 * The responses list answers "what did this person say"; this answers "which
 * of my ambassadors actually shared their link". Everyone holding a link is
 * included, including the ones on zero — a list of only the people who
 * delivered cannot tell you who to chase, which is the reason to open it.
 */
export const getSurveyAmbassadors = cache(
  async (surveyId: string): Promise<SurveyAmbassador[]> => {
    const db = createAdminClient();

    const [{ data: survey }, { data: links }, { data: responses }] =
      await Promise.all([
        db
          .from("surveys")
          .select("points_per_response")
          .eq("id", surveyId)
          .maybeSingle(),
        db
          .from("survey_links")
          .select("ambassador_id, slug, click_count, profiles(full_name, city, batch)")
          .eq("survey_id", surveyId),
        db
          .from("survey_responses")
          .select("ambassador_id, status")
          .eq("survey_id", surveyId),
      ]);

    const perResponse = survey?.points_per_response ?? 0;
    const rows = new Map<string, SurveyAmbassador>();

    for (const link of links ?? []) {
      const person = link.profiles as unknown as {
        full_name: string;
        city: string | null;
        batch: string | null;
      } | null;

      rows.set(link.ambassador_id, {
        id: link.ambassador_id,
        name: person?.full_name ?? "Unknown",
        city: person?.city ?? null,
        batch: person?.batch ?? null,
        slug: link.slug,
        clicks: link.click_count,
        responses: 0,
        flagged: 0,
        pointsEarned: 0,
        conversion: null,
      });
    }

    for (const response of responses ?? []) {
      const row = rows.get(response.ambassador_id);
      if (!row) continue;
      if (response.status === "valid") row.responses += 1;
      else row.flagged += 1;
    }

    return [...rows.values()]
      .map((row) => ({
        ...row,
        // Points are the flat rate times valid responses. Flagged ones were
        // already reversed in the ledger, so they must not be counted here.
        pointsEarned: row.responses * perResponse,
        conversion: row.clicks > 0 ? row.responses / row.clicks : null,
      }))
      .sort((a, b) => b.responses - a.responses || b.clicks - a.clicks);
  },
);
