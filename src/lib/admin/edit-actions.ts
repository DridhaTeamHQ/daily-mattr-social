"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin, fail, type ActionResult } from "@/lib/admin/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Enums } from "@/lib/database.types";

/**
 * Editing things after they exist, and moderating what came back.
 *
 * The rule running through all of it: a campaign or survey that people have
 * already acted on can have its wording fixed, but not the terms of the deal.
 * Retitling a live campaign is a correction; changing what it pays after
 * students have done the work is not, and this file will not do it.
 */

// ─── Campaigns ──────────────────────────────────────────────────────────────

export async function updateCampaign(
  campaignId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertAdmin();

    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const captionHint = String(formData.get("caption_hint") ?? "").trim();
    const endsAt = String(formData.get("ends_at") ?? "").trim();

    if (title.length < 3) {
      return { ok: false, message: "Give the campaign a title." };
    }

    const db = createAdminClient();

    // Points and tasks are deliberately absent. They are the deal a student
    // accepted when they started, and a live campaign must not be able to pay
    // less than it did an hour ago.
    const { error } = await db
      .from("campaigns")
      .update({
        title,
        description: description || null,
        caption_hint: captionHint || null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      })
      .eq("id", campaignId);
    if (error) throw error;

    revalidatePath("/admin/campaigns");
    revalidatePath(`/admin/campaigns/${campaignId}`);
    revalidatePath("/dashboard/campaigns");

    return { ok: true, message: "Campaign updated." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Archiving is a fourth status, not a delete.
 *
 * 'ended' means the deadline passed. 'archived' means stop showing it to me.
 * Deleting would take its submissions and the points that came from them with
 * it, which is why there is no delete.
 */
export async function archiveCampaign(
  campaignId: string,
  archived: boolean,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const db = createAdminClient();

    const { error } = await db
      .from("campaigns")
      .update({ status: archived ? "archived" : "ended" })
      .eq("id", campaignId);
    if (error) throw error;

    revalidatePath("/admin/campaigns");
    return { ok: true, message: archived ? "Archived." : "Back in the list." };
  } catch (err) {
    return fail(err);
  }
}

// ─── Surveys ────────────────────────────────────────────────────────────────

export async function updateSurvey(
  surveyId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertAdmin();

    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const capRaw = String(formData.get("response_cap") ?? "").trim();

    if (title.length < 3) {
      return { ok: false, message: "Give the survey a title." };
    }

    const cap = capRaw === "" ? null : Number(capRaw);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1)) {
      return { ok: false, message: "The response cap must be a whole number." };
    }

    const db = createAdminClient();

    // Questions are not editable here on purpose. Changing a question after
    // people have answered it leaves stored answers pointing at a prompt
    // nobody was actually shown.
    const { error } = await db
      .from("surveys")
      .update({
        title,
        description: description || null,
        response_cap: cap,
      })
      .eq("id", surveyId);
    if (error) throw error;

    revalidatePath("/admin/surveys");
    revalidatePath(`/admin/surveys/${surveyId}/responses`);

    return { ok: true, message: "Survey updated." };
  } catch (err) {
    return fail(err);
  }
}

// ─── Response moderation ────────────────────────────────────────────────────

/**
 * Flags a response, and reverses the point it earned.
 *
 * The reversal is the part that matters. Marking a response as a duplicate
 * while leaving the points on the ambassador's balance means the flag is
 * cosmetic, and someone can farm their own survey link with impunity. Points
 * come back with a compensating ledger row rather than a deletion, so the
 * original credit stays visible next to its reversal.
 */
export async function setResponseStatus(
  responseId: string,
  status: Enums<"response_status">,
  reason?: string,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const db = createAdminClient();

    const { data: response } = await db
      .from("survey_responses")
      .select("id, status, ambassador_id, survey_id, surveys(points_per_response)")
      .eq("id", responseId)
      .maybeSingle();

    if (!response) return { ok: false, message: "That response no longer exists." };
    if (response.status === status) {
      return { ok: true, message: `Already ${status}.` };
    }

    const points =
      (response.surveys as unknown as { points_per_response: number } | null)
        ?.points_per_response ?? 0;

    const wasCounted = response.status === "valid";
    const nowCounted = status === "valid";

    const { error } = await db
      .from("survey_responses")
      .update({ status, flag_reason: reason?.trim() || null })
      .eq("id", responseId);
    if (error) throw error;

    if (points > 0 && wasCounted !== nowCounted) {
      const { error: ledgerError } = await db.from("point_ledger").insert({
        ambassador_id: response.ambassador_id,
        delta: nowCounted ? points : -points,
        reason: nowCounted ? "survey_response" : "revoke",
        source_type: "survey_response_moderation",
        // Unique per direction, so the same response can be flagged and
        // restored without tripping the idempotency index.
        source_id: response.id,
        note: nowCounted
          ? "Response restored"
          : `Response marked ${status}`,
        created_by: actorId,
        phase: "phase_1",
      });
      if (ledgerError) throw ledgerError;
    }

    revalidatePath(`/admin/surveys/${response.survey_id}/responses`);
    revalidatePath("/admin/surveys");

    return {
      ok: true,
      message:
        points > 0 && wasCounted && !nowCounted
          ? `Marked ${status}, and ${points} points reversed.`
          : `Marked ${status}.`,
    };
  } catch (err) {
    return fail(err);
  }
}
