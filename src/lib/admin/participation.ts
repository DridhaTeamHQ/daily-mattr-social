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
          .select("ambassador_id, delta")
          .eq("reason", "instagram_task"),
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
    // approval that was later revoked stops counting.
    for (const entry of ledger ?? []) {
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
          .select("ambassador_id, delta")
          .eq("reason", "survey_response"),
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
