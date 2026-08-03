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
  // Supabase's PostgrestError is a plain object, not an Error subclass, so an
  // `instanceof Error` check alone swallows the only useful diagnostic and
  // reports "Something went wrong" for every database failure.
  if (err instanceof Error) return { ok: false, message: err.message };

  if (err && typeof err === "object" && "message" in err) {
    const { message, hint } = err as { message?: unknown; hint?: unknown };
    if (typeof message === "string" && message) {
      return {
        ok: false,
        message: typeof hint === "string" && hint ? `${message} (${hint})` : message,
      };
    }
  }

  return { ok: false, message: "Something went wrong" };
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

export type CreatedAmbassador = ActionResult & {
  credentials?: { email: string; password: string; fullName: string };
};

/**
 * Creates an ambassador with a temporary password.
 *
 * This replaces invite-by-email. Supabase's built-in SMTP is rate limited to a
 * handful of messages an hour and often doesn't deliver at all, which left
 * invited students with an account they could never reach. Handing the admin a
 * password to pass on removes the mail server from the critical path entirely.
 *
 * The account stays `invited` until the student sets their own password, so a
 * half-onboarded person collects no survey links and doesn't appear on the
 * leaderboard.
 */
export async function createAmbassador(
  formData: FormData,
): Promise<CreatedAmbassador> {
  try {
    const actorId = await assertAdmin();

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const college = String(formData.get("college") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !fullName) {
      return { ok: false, message: "Name and email are both required." };
    }
    if (password.length < 8) {
      return { ok: false, message: "Temporary password must be at least 8 characters." };
    }

    const db = createAdminClient();

    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, college: college || null, role: "ambassador" },
    });

    if (error) {
      // The most common failure by far, and the generic message is unhelpful.
      if (/already|registered|exists/i.test(error.message)) {
        return {
          ok: false,
          message: `${email} already has an account. Use "Reset password" on their row instead.`,
        };
      }
      throw error;
    }

    // The trigger marks anyone created with a password as active. Walk that
    // back: they haven't chosen their own password yet.
    const { error: profileError } = await db
      .from("profiles")
      .update({ status: "invited", must_change_password: true, full_name: fullName })
      .eq("id", created.user.id);

    if (profileError) {
      // Otherwise the address is taken by an account nobody can finish setting
      // up, and re-adding them just fails with "already registered".
      await db.auth.admin.deleteUser(created.user.id).catch(() => {});
      throw profileError;
    }

    await audit(actorId, "ambassador.create", "profile", created.user.id, { email });

    revalidatePath("/admin/ambassadors");
    return {
      ok: true,
      message: `${fullName} can sign in now`,
      credentials: { email, password, fullName },
    };
  } catch (err) {
    return fail(err);
  }
}

/** Issues a fresh temporary password, e.g. when a student is locked out. */
export async function resetAmbassadorPassword(
  profileId: string,
  password: string,
): Promise<CreatedAmbassador> {
  try {
    const actorId = await assertAdmin();

    if (password.length < 8) {
      return { ok: false, message: "Temporary password must be at least 8 characters." };
    }

    const db = createAdminClient();

    const { error } = await db.auth.admin.updateUserById(profileId, {
      password,
      email_confirm: true,
    });
    if (error) throw error;

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", profileId)
      .select("email, full_name")
      .single();
    if (profileError) throw profileError;

    await audit(actorId, "ambassador.reset_password", "profile", profileId, {});

    revalidatePath("/admin/ambassadors");
    return {
      ok: true,
      message: "New temporary password set",
      credentials: {
        email: profile.email,
        password,
        fullName: profile.full_name || profile.email,
      },
    };
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

export type SurveyQuestionInput = {
  type: Enums<"question_type">;
  prompt: string;
  help_text?: string;
  options?: string[];
  required: boolean;
};

/**
 * Creates a survey and its questions in one go.
 *
 * Saved as a draft: publishing is a separate, deliberate step, because that is
 * what issues a link to every active ambassador and tells them all about it.
 */
export async function createSurvey(input: {
  title: string;
  description?: string;
  pointsPerResponse: number;
  requireEmail: boolean;
  requirePhone: boolean;
  questions: SurveyQuestionInput[];
}): Promise<ActionResult & { surveyId?: string }> {
  try {
    const actorId = await assertAdmin();
    const supabase = await createClient();

    const title = input.title.trim();
    if (!title) return { ok: false, message: "Give the survey a title." };

    if (!Number.isInteger(input.pointsPerResponse) ||
        input.pointsPerResponse < 0 ||
        input.pointsPerResponse > 1000) {
      return { ok: false, message: "Points per response must be between 0 and 1000." };
    }

    const questions = input.questions
      .map((q) => ({ ...q, prompt: q.prompt.trim() }))
      .filter((q) => q.prompt.length > 0);

    if (questions.length === 0) {
      return { ok: false, message: "Add at least one question." };
    }

    // Mirrors the survey_questions_choices_present constraint. Checking here
    // means a useful message instead of a raw Postgres error.
    for (const [i, q] of questions.entries()) {
      if (q.type === "single_choice" || q.type === "multi_choice") {
        const options = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (options.length < 2) {
          return {
            ok: false,
            message: `Question ${i + 1} is a choice question, so it needs at least two options.`,
          };
        }
      }
    }

    const { data: survey, error } = await supabase
      .from("surveys")
      .insert({
        title,
        description: input.description?.trim() || null,
        points_per_response: input.pointsPerResponse,
        require_email: input.requireEmail,
        require_phone: input.requirePhone,
        status: "draft",
        created_by: actorId,
      })
      .select("id")
      .single();
    if (error) throw error;

    const { error: questionError } = await supabase.from("survey_questions").insert(
      questions.map((q, index) => ({
        survey_id: survey.id,
        order_index: index,
        type: q.type,
        prompt: q.prompt,
        help_text: q.help_text?.trim() || null,
        options:
          q.type === "single_choice" || q.type === "multi_choice"
            ? ((q.options ?? []).map((o) => o.trim()).filter(Boolean) as never)
            : ([] as never),
        required: q.required,
      })),
    );

    if (questionError) {
      // Without this the survey would linger with no questions and no way to
      // add any, since there is no edit screen yet.
      await supabase.from("surveys").delete().eq("id", survey.id);
      throw questionError;
    }

    await audit(actorId, "survey.create", "survey", survey.id, {
      title,
      questions: questions.length,
    });

    revalidatePath("/admin/surveys");
    return {
      ok: true,
      message: `"${title}" saved as a draft`,
      surveyId: survey.id,
    };
  } catch (err) {
    return fail(err);
  }
}

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
      // the moment the survey appears on their dashboard. A failure here has
      // to surface: a live survey nobody has a link to looks like the feature
      // is broken, and the admin would never know why.
      const { data: created, error: linkError } = await createAdminClient().rpc(
        "ensure_survey_links",
        { target_survey: surveyId },
      );

      if (linkError) {
        return {
          ok: false,
          message: `Published, but issuing links failed: ${linkError.message}. Use "Issue missing links".`,
        };
      }
      if (created) extra = ` · ${created} links issued`;
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
