"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeAmbassadorIds, notify, notifyMany } from "@/lib/notifications";
import type { Enums } from "@/lib/database.types";

/**
 * Admin mutations.
 *
 * Several of these need the service-role client: `point_ledger` and
 * `audit_log` have no INSERT policy for `authenticated` at all, by design —
 * the client must never be able to mint points.
 *
 * Because that client bypasses RLS, every action starts with `assertAdmin()`.
 * That check is the only thing standing between a signed-in student and the
 * ledger, so it is not optional and it is not "belt and braces".
 */

export type ActionResult = { ok: boolean; message: string };

async function assertAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.status !== "active") {
    throw new Error("Not authorised");
  }
  return user.id;
}

async function audit(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  meta: Record<string, unknown> = {},
) {
  await createAdminClient()
    .from("audit_log")
    .insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      meta: meta as never,
    });
}

function fail(err: unknown): ActionResult {
  const message = err instanceof Error ? err.message : "Something went wrong";
  return { ok: false, message };
}

// ─── Review queue ───────────────────────────────────────────────────────────

export async function approveSubmission(
  submissionId: string,
  note?: string,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const db = createAdminClient();

    const { data: submission, error } = await db
      .from("submissions")
      .select("id, status, ambassador_id, campaign_task_id, campaign_tasks(points, type)")
      .eq("id", submissionId)
      .single();
    if (error) throw error;

    if (submission.status === "approved" || submission.status === "auto_approved") {
      return { ok: true, message: "Already approved" };
    }

    const points = submission.campaign_tasks?.points ?? 0;

    const { error: updateError } = await db
      .from("submissions")
      .update({
        status: "approved",
        reviewer_id: actorId,
        review_note: note ?? null,
        reviewed_at: new Date().toISOString(),
        reject_reason: null,
      })
      .eq("id", submissionId);
    if (updateError) throw updateError;

    if (points > 0) {
      // The (source_type, source_id, direction) unique index makes this safe to
      // retry: a double-clicked Approve cannot pay twice.
      const { error: ledgerError } = await db.from("point_ledger").insert({
        ambassador_id: submission.ambassador_id,
        delta: points,
        reason: "instagram_task",
        source_type: "submission",
        source_id: submissionId,
        note: note ?? "Screenshot approved",
        created_by: actorId,
      });
      if (ledgerError && !ledgerError.message.includes("duplicate key")) {
        throw ledgerError;
      }
    }

    await audit(actorId, "submission.approve", "submission", submissionId, {
      points,
    });

    await notify({
      profileId: submission.ambassador_id,
      type: "submission_approved",
      title: `Approved — you earned ${points} points`,
      body: note || "Your screenshot passed review.",
      href: "/dashboard/campaigns",
      meta: { submissionId, points },
    }).catch(() => {
      // The points are already credited; a failed notification must not undo
      // that or make the admin think the approval didn't happen.
    });

    revalidatePath("/admin/review");
    revalidatePath("/admin");
    return { ok: true, message: `Approved · +${points} points` };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectSubmission(
  submissionId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    if (!reason.trim()) {
      return { ok: false, message: "Give a reason — the student sees it." };
    }

    const db = createAdminClient();
    const { error } = await db
      .from("submissions")
      .update({
        status: "rejected",
        reject_reason: reason.trim(),
        reviewer_id: actorId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", submissionId);
    if (error) throw error;

    await audit(actorId, "submission.reject", "submission", submissionId, {
      reason,
    });

    const { data: rejected } = await db
      .from("submissions")
      .select("ambassador_id")
      .eq("id", submissionId)
      .single();

    if (rejected) {
      await notify({
        profileId: rejected.ambassador_id,
        type: "submission_rejected",
        title: "Screenshot not approved",
        body: reason.trim(),
        href: "/dashboard/campaigns",
        meta: { submissionId },
      }).catch(() => {});
    }

    revalidatePath("/admin/review");
    revalidatePath("/admin");
    return { ok: true, message: "Rejected" };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeSubmission(
  submissionId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const db = createAdminClient();

    const { data: submission, error } = await db
      .from("submissions")
      .select("id, ambassador_id, campaign_tasks(points)")
      .eq("id", submissionId)
      .single();
    if (error) throw error;

    const points = submission.campaign_tasks?.points ?? 0;

    const { error: updateError } = await db
      .from("submissions")
      .update({
        status: "revoked",
        reject_reason: reason || "Revoked after review",
        reviewer_id: actorId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", submissionId);
    if (updateError) throw updateError;

    if (points > 0) {
      // A compensating row, not a delete. Same source pair, opposite
      // direction, so the partial unique index permits exactly one reversal.
      const { error: ledgerError } = await db.from("point_ledger").insert({
        ambassador_id: submission.ambassador_id,
        delta: -points,
        reason: "revoke",
        source_type: "submission",
        source_id: submissionId,
        note: reason || "Approval reversed",
        created_by: actorId,
      });
      if (ledgerError && !ledgerError.message.includes("duplicate key")) {
        throw ledgerError;
      }
    }

    await audit(actorId, "submission.revoke", "submission", submissionId, {
      points,
      reason,
    });

    await notify({
      profileId: submission.ambassador_id,
      type: "submission_revoked",
      title: `${points} points reversed`,
      body: reason || "A previous approval was reversed after a second look.",
      href: "/dashboard",
      meta: { submissionId, points },
    }).catch(() => {});

    revalidatePath("/admin/review");
    revalidatePath("/admin");
    return { ok: true, message: `Revoked · −${points} points` };
  } catch (err) {
    return fail(err);
  }
}

// ─── Ambassadors ────────────────────────────────────────────────────────────

export async function setAmbassadorStatus(
  profileId: string,
  status: Enums<"user_status">,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const supabase = await createClient();

    // Admins can write profiles under RLS, so no service-role needed here.
    const { error } = await supabase
      .from("profiles")
      .update({ status })
      .eq("id", profileId);
    if (error) throw error;

    await audit(actorId, "ambassador.status", "profile", profileId, { status });

    revalidatePath("/admin/ambassadors");
    return { ok: true, message: `Marked ${status}` };
  } catch (err) {
    return fail(err);
  }
}

export async function adjustPoints(
  profileId: string,
  delta: number,
  note: string,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();

    if (!Number.isInteger(delta) || delta === 0) {
      return { ok: false, message: "Enter a non-zero whole number." };
    }
    if (!note.trim()) {
      return { ok: false, message: "Say why — this shows on their history." };
    }

    const db = createAdminClient();
    // No source pair: manual adjustments are intentionally repeatable, so two
    // separate +50 bonuses both land.
    const { error } = await db.from("point_ledger").insert({
      ambassador_id: profileId,
      delta,
      reason: delta > 0 ? "manual_adjust" : "revoke",
      note: note.trim(),
      created_by: actorId,
    });
    if (error) throw error;

    await audit(actorId, "points.adjust", "profile", profileId, { delta, note });

    await notify({
      profileId,
      type: "points_awarded",
      title:
        delta > 0
          ? `You were given ${delta} points`
          : `${Math.abs(delta)} points were removed`,
      body: note.trim(),
      href: "/dashboard",
      meta: { delta },
    }).catch(() => {});

    revalidatePath("/admin/ambassadors");
    revalidatePath("/admin");
    return {
      ok: true,
      message: `${delta > 0 ? "+" : "−"}${Math.abs(delta)} points recorded`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function inviteAmbassador(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const college = String(formData.get("college") ?? "").trim();

    if (!email || !fullName) {
      return { ok: false, message: "Name and email are both required." };
    }

    const db = createAdminClient();
    const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, college: college || null, role: "ambassador" },
    });
    if (error) throw error;

    await audit(actorId, "ambassador.invite", "profile", data.user.id, { email });

    revalidatePath("/admin/ambassadors");
    return { ok: true, message: `Invite sent to ${email}` };
  } catch (err) {
    return fail(err);
  }
}

// ─── Campaigns ──────────────────────────────────────────────────────────────

export async function setCampaignStatus(
  campaignId: string,
  status: Enums<"campaign_status">,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const supabase = await createClient();

    const { error } = await supabase
      .from("campaigns")
      .update({ status })
      .eq("id", campaignId);
    if (error) throw error;

    await audit(actorId, "campaign.status", "campaign", campaignId, { status });

    // Only a launch is worth interrupting people for. Ending a campaign is
    // not news anyone wants a push notification about.
    if (status === "live") {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("title")
        .eq("id", campaignId)
        .maybeSingle();

      await notifyMany(await activeAmbassadorIds(), {
        type: "campaign_live",
        title: "New campaign is live",
        body: campaign?.title ?? "There's new work to pick up.",
        href: "/dashboard/campaigns",
        meta: { campaignId },
      });
    }

    revalidatePath("/admin/campaigns");
    revalidatePath("/dashboard/campaigns");
    return { ok: true, message: `Campaign is now ${status}` };
  } catch (err) {
    return fail(err);
  }
}

export async function createCampaign(formData: FormData): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const supabase = await createClient();

    const title = String(formData.get("title") ?? "").trim();
    const instagramUrl = String(formData.get("instagram_url") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const handle = String(formData.get("expected_handle") ?? "dailymattr")
      .trim()
      .replace(/^@/, "");

    if (!title || !instagramUrl) {
      return { ok: false, message: "Title and Instagram URL are required." };
    }

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({
        title,
        instagram_url: instagramUrl,
        description: description || null,
        expected_handle: handle || "dailymattr",
        created_by: actorId,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw error;

    // Task points come from the form; a campaign with no tasks is useless, so
    // any type given a positive value is created.
    const tasks = (["like", "comment", "share", "story"] as const)
      .map((type, i) => ({
        type,
        points: Number(formData.get(`points_${type}`) ?? 0),
        order_index: i,
      }))
      .filter((t) => Number.isFinite(t.points) && t.points > 0);

    if (tasks.length === 0) {
      return {
        ok: false,
        message: "Give at least one task a point value above zero.",
      };
    }

    const { error: taskError } = await supabase.from("campaign_tasks").insert(
      tasks.map((t) => ({
        campaign_id: campaign.id,
        type: t.type,
        points: t.points,
        order_index: t.order_index,
        required: t.type === "like" || t.type === "comment",
      })),
    );
    if (taskError) throw taskError;

    await audit(actorId, "campaign.create", "campaign", campaign.id, { title });

    revalidatePath("/admin/campaigns");
    return { ok: true, message: `"${title}" created as a draft` };
  } catch (err) {
    return fail(err);
  }
}

// ─── Surveys ────────────────────────────────────────────────────────────────

export async function setSurveyStatus(
  surveyId: string,
  status: Enums<"survey_status">,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const supabase = await createClient();

    const { error } = await supabase
      .from("surveys")
      .update({ status })
      .eq("id", surveyId);
    if (error) throw error;

    let extra = "";
    if (status === "live") {
      // Going live is what issues links, so every active ambassador has one
      // the moment the survey appears on their dashboard.
      const { data: created } = await createAdminClient().rpc(
        "ensure_survey_links",
        { target_survey: surveyId },
      );
      if (created) extra = ` · ${created} new links issued`;
    }

    await audit(actorId, "survey.status", "survey", surveyId, { status });

    if (status === "live") {
      const { data: survey } = await supabase
        .from("surveys")
        .select("title, points_per_response")
        .eq("id", surveyId)
        .maybeSingle();

      await notifyMany(await activeAmbassadorIds(), {
        type: "survey_live",
        title: "New survey — your link is ready",
        body: survey
          ? `${survey.title} · ${survey.points_per_response} points per response`
          : "Share your link to start earning.",
        href: "/dashboard/surveys",
        meta: { surveyId },
      });
    }

    revalidatePath("/admin/surveys");
    revalidatePath("/dashboard/surveys");
    return { ok: true, message: `Survey is now ${status}${extra}` };
  } catch (err) {
    return fail(err);
  }
}

export async function issueSurveyLinks(surveyId: string): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();

    const { data: created, error } = await createAdminClient().rpc(
      "ensure_survey_links",
      { target_survey: surveyId },
    );
    if (error) throw error;

    await audit(actorId, "survey.links", "survey", surveyId, { created });

    revalidatePath("/admin/surveys");
    return {
      ok: true,
      message: created ? `${created} new links issued` : "Everyone already has a link",
    };
  } catch (err) {
    return fail(err);
  }
}
