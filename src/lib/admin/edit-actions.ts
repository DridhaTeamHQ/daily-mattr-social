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
    const platform = String(formData.get("platform") ?? "").trim();

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
        platform: platform || "Instagram",
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
 * This is what a campaign with work against it gets: deleting one would take
 * its submissions and leave behind the points they earned. `deleteCampaign`
 * below exists for the drafts and mistakes, and refuses anything else.
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

// ─── Achievements ───────────────────────────────────────────────────────────

/**
 * Recognition written by hand for one ambassador.
 *
 * Free text, because the point of it is the things a counter cannot see —
 * running a stall, helping somebody else finish, turning up when it rained.
 * The date is separate from when it was typed, since these are usually
 * recorded after the fact.
 */
export async function addAchievement(
  ambassadorId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();

    const title = String(formData.get("title") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const awardedAt = String(formData.get("awarded_at") ?? "").trim();

    if (title.length < 2) {
      return { ok: false, message: "Say what they did." };
    }
    if (title.length > 120) {
      return { ok: false, message: "Keep the title under 120 characters." };
    }
    if (note.length > 500) {
      return { ok: false, message: "Keep the note under 500 characters." };
    }

    const db = createAdminClient();
    const { error } = await db.from("achievements").insert({
      ambassador_id: ambassadorId,
      title,
      note: note || null,
      // A date input gives a plain day; anything else falls back to now.
      awarded_at: awardedAt ? new Date(awardedAt).toISOString() : undefined,
      created_by: actorId,
    });
    if (error) throw error;

    revalidatePath(`/admin/ambassadors/${ambassadorId}`);
    // The ambassador sees it on their own rewards page.
    revalidatePath("/dashboard/rewards");

    return { ok: true, message: `Added "${title}".` };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAchievement(
  achievementId: string,
  ambassadorId: string,
): Promise<ActionResult> {
  try {
    await assertAdmin();

    const { error } = await createAdminClient()
      .from("achievements")
      .delete()
      .eq("id", achievementId);
    if (error) throw error;

    revalidatePath(`/admin/ambassadors/${ambassadorId}`);
    revalidatePath("/dashboard/rewards");

    return { ok: true, message: "Achievement removed." };
  } catch (err) {
    return fail(err);
  }
}

// ─── Deleting a campaign ────────────────────────────────────────────────────

/**
 * Removes a campaign and its tasks outright.
 *
 * Refused once anybody has submitted to it. The foreign keys cascade
 * campaigns → tasks → submissions, so deleting a campaign with work against it
 * would take students' uploads with it while the point_ledger rows that paid
 * for those uploads stayed behind — that ledger is append-only, so the points
 * cannot be walked back either. The result would be points paid for work the
 * database can no longer show. Archiving is the answer for those; this is for
 * the drafts and mistakes.
 */
export async function deleteCampaign(campaignId: string): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const db = createAdminClient();

    const { data: campaign } = await db
      .from("campaigns")
      .select("title")
      .eq("id", campaignId)
      .maybeSingle();
    if (!campaign) return { ok: false, message: "That campaign is already gone." };

    const { data: tasks } = await db
      .from("campaign_tasks")
      .select("id")
      .eq("campaign_id", campaignId);
    const taskIds = (tasks ?? []).map((task) => task.id);

    if (taskIds.length > 0) {
      const { count } = await db
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .in("campaign_task_id", taskIds);

      if ((count ?? 0) > 0) {
        return {
          ok: false,
          message: `"${campaign.title}" has ${count} submission${count === 1 ? "" : "s"}. Archive it instead — deleting would take those uploads with it.`,
        };
      }
    }

    const { error } = await db.from("campaigns").delete().eq("id", campaignId);
    if (error) throw error;

    // Recorded by hand: this file has no audit helper, and a deletion is the
    // one thing here that leaves nothing behind to look at afterwards.
    await db.from("audit_log").insert({
      actor_id: actorId,
      action: "campaign.delete",
      entity_type: "campaign",
      entity_id: campaignId,
      meta: { title: campaign.title, tasks: taskIds.length },
    });

    revalidatePath("/admin/campaigns");
    revalidatePath("/dashboard/campaigns");

    return { ok: true, message: `"${campaign.title}" deleted.` };
  } catch (err) {
    return fail(err);
  }
}
