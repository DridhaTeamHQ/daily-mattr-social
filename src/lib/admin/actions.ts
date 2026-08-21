"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { sendAmbassadorWelcomeEmail } from "@/lib/ambassador-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeAmbassadorIds, notify, notifyMany } from "@/lib/notifications";
import { assertAdmin, fail } from "@/lib/admin/guards";
import { awardReferralBonus, awardStreakBonus } from "@/lib/rewards-engine";
import { evaluateBadges } from "@/lib/badges";
import { nextReferralCode } from "@/lib/referral-code";
import { canonicalBatch, canonicalCity } from "@/lib/batches";
import type { ActionResult } from "@/lib/admin/guards";
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

/** Same shape the library page uses, so slugs stay consistent either way. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
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

// ─── Review queue ───────────────────────────────────────────────────────────

/**
 * Approve one submission. The whole of it, minus the session check.
 *
 * Split out so "Approve all" runs the identical path rather than a second
 * implementation of it — the points, the streak, the badges, the audit row and
 * the notification are the part that must not drift between approving one
 * screenshot and approving forty.
 *
 * Returns the points actually credited, which is not the same as the task's
 * value: a submission that was approved and later revoked keeps both ledger
 * rows, and the unique index refuses a third, so re-approving restores the
 * status and credits nothing.
 */
async function approveOne(
  db: ReturnType<typeof createAdminClient>,
  actorId: string,
  submissionId: string,
  note?: string,
): Promise<{ ok: true; credited: number; already: boolean } | { ok: false; reason: string }> {
  const { data: submission, error } = await db
    .from("submissions")
    .select("id, status, ambassador_id, campaign_task_id, campaign_tasks(points, type)")
    .eq("id", submissionId)
    .single();
  if (error) return { ok: false, reason: error.message };

  if (submission.status === "approved" || submission.status === "auto_approved") {
    return { ok: true, credited: 0, already: true };
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
  if (updateError) return { ok: false, reason: updateError.message };

  let credited = 0;

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
      return { ok: false, reason: ledgerError.message };
    }

    // A duplicate here is the interesting case rather than a no-op. See the
    // doc comment above.
    credited = ledgerError ? 0 : points;
  }

  await audit(actorId, "submission.approve", "submission", submissionId, { points });

  // Checked after the points land, since the week only counts as active once
  // something has been earned in it.
  await awardStreakBonus(submission.ambassador_id, actorId).catch(() => {});
  await evaluateBadges(submission.ambassador_id).catch(() => {});

  await notify({
    profileId: submission.ambassador_id,
    type: "submission_approved",
    title: credited ? `Approved — you earned ${credited} points` : "Approved",
    body:
      note ||
      (credited
        ? "Your screenshot passed review."
        : "Your screenshot passed review. The points for it were already settled earlier."),
    href: "/dashboard/campaigns",
    meta: { submissionId, points: credited },
  }).catch(() => {
    // The points are already credited; a failed notification must not undo
    // that or make the admin think the approval didn't happen.
  });

  return { ok: true, credited, already: false };
}

export async function approveSubmission(
  submissionId: string,
  note?: string,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const result = await approveOne(createAdminClient(), actorId, submissionId, note);

    if (!result.ok) throw new Error(result.reason);

    revalidatePath("/admin/review");
    revalidatePath("/admin");

    if (result.already) return { ok: true, message: "Already approved" };

    return {
      ok: true,
      message: result.credited
        ? `Approved · +${result.credited} points`
        : "Approved · no points (this one was already settled)",
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Approve everything still waiting, in one press.
 *
 * A campaign that goes out to thirty ambassadors produces thirty near-identical
 * screenshots, and clicking Approve thirty times is the kind of work that gets
 * skipped — which is worse than doing it quickly, because an unreviewed queue
 * silently withholds points people have earned.
 *
 * Scoped to whatever the queue is scoped to. An admin who arrived from one
 * campaign is looking at that campaign, and a button that quietly approved the
 * whole programme instead would be the single worst thing on this page.
 *
 * Sequential on purpose. Each approval writes points, a streak check, badges,
 * an audit row and a notification; firing forty of those at once is how you
 * exhaust the connection pool and end up with half a queue approved and no
 * record of which half. Slower and completely ordered is the right trade for
 * something that moves money.
 */
export async function approveAllSubmissions(
  campaignId?: string | null,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const db = createAdminClient();

    // Submissions point at a task, not a campaign, so the scope resolves
    // through tasks — the same path the queue itself uses.
    let taskIds: string[] | null = null;
    if (campaignId) {
      const { data } = await db
        .from("campaign_tasks")
        .select("id")
        .eq("campaign_id", campaignId);
      taskIds = (data ?? []).map((t) => t.id);
      if (taskIds.length === 0) {
        return { ok: false, message: "That campaign has no tasks yet." };
      }
    }

    let query = db
      .from("submissions")
      .select("id")
      .in("status", ["pending", "needs_review"])
      .order("uploaded_at", { ascending: true });

    if (taskIds) query = query.in("campaign_task_id", taskIds);

    const { data: open, error } = await query;
    if (error) throw error;
    if (!open?.length) return { ok: false, message: "Nothing is waiting." };

    let approved = 0;
    let points = 0;
    const failures: string[] = [];

    for (const row of open) {
      const result = await approveOne(db, actorId, row.id, undefined);
      if (result.ok) {
        approved += 1;
        points += result.credited;
      } else {
        failures.push(result.reason);
      }
    }

    revalidatePath("/admin/review");
    revalidatePath("/admin");

    // The failures are named in the count rather than thrown, so one bad row
    // does not hide the thirty that went through.
    const tail = failures.length ? ` · ${failures.length} failed` : "";

    return {
      ok: approved > 0,
      message: approved
        ? `Approved ${approved} · +${points} points${tail}`
        : `Nothing approved${tail}`,
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * The ids a bulk action may actually touch.
 *
 * Selections are made in a browser and posted back minutes later, by which
 * time another admin may have decided half of them. Re-reading the statuses
 * here is what stops a stale tick from re-approving something that was
 * rejected in the meantime — the tick says "I looked at this one", not "this
 * one is still waiting".
 */
async function openSubset(
  db: ReturnType<typeof createAdminClient>,
  submissionIds: string[],
): Promise<{ ids: string[]; skipped: number }> {
  const wanted = [...new Set(submissionIds)].filter(Boolean);
  if (wanted.length === 0) return { ids: [], skipped: 0 };

  const { data, error } = await db
    .from("submissions")
    .select("id")
    .in("id", wanted)
    .in("status", ["pending", "needs_review"])
    .order("uploaded_at", { ascending: true });
  if (error) throw error;

  const ids = (data ?? []).map((row) => row.id);
  return { ids, skipped: wanted.length - ids.length };
}

/** "3 failed · 1 already decided", or "" when neither happened. */
function bulkTail(failed: number, skipped: number): string {
  const parts = [
    failed ? `${failed} failed` : "",
    skipped ? `${skipped} already decided` : "",
  ].filter(Boolean);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

/**
 * Approve a hand-picked set.
 *
 * "Approve all" clears the queue; this clears the part of it an admin has
 * actually looked at, which is the honest version of the same shortcut when
 * one screenshot in the twenty needs a closer look. Sequential and through
 * `approveOne` for the same reasons as the bulk button above it.
 */
export async function approveSubmissions(
  submissionIds: string[],
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const db = createAdminClient();
    const { ids, skipped } = await openSubset(db, submissionIds);

    if (ids.length === 0) {
      return {
        ok: false,
        message: skipped
          ? "Those have all been decided already."
          : "Nothing selected.",
      };
    }

    let approved = 0;
    let points = 0;
    const failures: string[] = [];

    for (const id of ids) {
      const result = await approveOne(db, actorId, id, undefined);
      if (result.ok) {
        approved += 1;
        points += result.credited;
      } else {
        failures.push(result.reason);
      }
    }

    revalidatePath("/admin/review");
    revalidatePath("/admin");

    const tail = bulkTail(failures.length, skipped);

    return {
      ok: approved > 0,
      message: approved
        ? `Approved ${approved} · +${points} points${tail}`
        : `Nothing approved${tail}`,
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Reject one submission. Everything but the session check, so that rejecting
 * one screenshot and rejecting a selected twenty stay the same code path —
 * the status, the audit row and the notification that tells a student why.
 */
async function rejectOne(
  db: ReturnType<typeof createAdminClient>,
  actorId: string,
  submissionId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await db
    .from("submissions")
    .update({
      status: "rejected",
      reject_reason: reason,
      reviewer_id: actorId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  if (error) return { ok: false, reason: error.message };

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
      body: reason,
      href: "/dashboard/campaigns",
      meta: { submissionId },
    }).catch(() => {});
  }

  return { ok: true };
}

export async function rejectSubmission(
  submissionId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const trimmed = reason.trim();
    if (!trimmed) {
      return { ok: false, message: "Give a reason — the student sees it." };
    }

    const result = await rejectOne(
      createAdminClient(),
      actorId,
      submissionId,
      trimmed,
    );
    if (!result.ok) throw new Error(result.reason);

    revalidatePath("/admin/review");
    revalidatePath("/admin");
    return { ok: true, message: "Rejected" };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Reject a hand-picked set, with one reason between them.
 *
 * Every student in the selection reads that sentence as the explanation for
 * their own screenshot, which is the constraint the dialog wording leans on:
 * a shared reason is right for "the wrong reel" and wrong for anything that
 * only applies to some of them.
 */
export async function rejectSubmissions(
  submissionIds: string[],
  reason: string,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const trimmed = reason.trim();
    if (!trimmed) {
      return { ok: false, message: "Give a reason — the students see it." };
    }

    const db = createAdminClient();
    const { ids, skipped } = await openSubset(db, submissionIds);

    if (ids.length === 0) {
      return {
        ok: false,
        message: skipped
          ? "Those have all been decided already."
          : "Nothing selected.",
      };
    }

    let rejected = 0;
    const failures: string[] = [];

    for (const id of ids) {
      const result = await rejectOne(db, actorId, id, trimmed);
      if (result.ok) rejected += 1;
      else failures.push(result.reason);
    }

    revalidatePath("/admin/review");
    revalidatePath("/admin");

    const tail = bulkTail(failures.length, skipped);

    return {
      ok: rejected > 0,
      message: rejected
        ? `Rejected ${rejected}${tail}`
        : `Nothing rejected${tail}`,
    };
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

/**
 * Correct someone's college, city and batch after the fact.
 *
 * City and batch were collectable only at creation, which left every profile
 * made before those fields existed permanently unassigned — and every batch
 * and geography breakdown reading "Unassigned" for most of the programme with
 * no way in the product to fix it.
 *
 * Reissuing the referral code is opt-in and separate, because a code is an
 * identifier that has already been printed on posters and pasted into bios.
 * Changing it silently would break links that are out in the world.
 */
export async function updateAmbassadorSegments(
  profileId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const supabase = await createClient();

    const fullName = String(formData.get("full_name") ?? "").trim();
    const college = String(formData.get("college") ?? "").trim();
    const city = canonicalCity(formData.get("city")?.toString());
    const batch = canonicalBatch(formData.get("batch")?.toString());
    const reissue = formData.get("reissue_code") === "on";

    // A blank name would leave rows identified by nothing but their initials.
    if (!fullName) {
      return { ok: false, message: "A name is required." };
    }

    const newCode = reissue
      ? await nextReferralCode(createAdminClient(), batch)
      : null;

    const patch = {
      full_name: fullName,
      college: college || null,
      city,
      batch,
      ...(newCode ? { referral_code: newCode } : {}),
    };

    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", profileId);
    if (error) throw error;

    await audit(actorId, "ambassador.segments", "profile", profileId, {
      full_name: fullName,
      college: college || null,
      city,
      batch,
      referral_code: newCode,
    });

    revalidatePath("/admin/ambassadors");
    revalidatePath(`/admin/ambassadors/${profileId}`);
    revalidatePath("/admin/analytics");

    return {
      ok: true,
      message: newCode ? `Saved — new code ${newCode}` : "Details saved",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function setAmbassadorStatus(
  profileId: string,
  status: Enums<"user_status">,
  reason?: string,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const supabase = await createClient();

    const note = (reason ?? "").trim();

    // Required when taking access away, optional when giving it back.
    // "Suspended" with no reason is unanswerable six months later — the
    // student cannot be told why and whoever reverses it cannot tell what
    // they are reversing.
    if (status === "suspended" && note.length < 3) {
      return { ok: false, message: "Give a reason for the suspension." };
    }

    // Admins can write profiles under RLS, so no service-role needed here.
    const { error } = await supabase
      .from("profiles")
      .update({
        status,
        status_reason: note || null,
        status_changed_at: new Date().toISOString(),
        status_changed_by: actorId,
      })
      .eq("id", profileId);
    if (error) throw error;

    await audit(actorId, "ambassador.status", "profile", profileId, {
      status,
      reason: note || null,
    });

    if (status === "suspended") {
      await notify({
        profileId,
        type: "account",
        title: "Your account has been paused",
        body: note,
        href: "/dashboard",
      }).catch(() => {});
    }

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
  emailDelivery?: {
    status: "sent" | "skipped" | "failed";
    message: string;
  };
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
    // Stored in canonical form so "2", "batch 2" and "Batch 2" are one batch
    // rather than three, in the grouping and in the code prefix alike.
    const city = canonicalCity(formData.get("city")?.toString()) ?? "";
    const batch = canonicalBatch(formData.get("batch")?.toString()) ?? "";
    const password = String(formData.get("password") ?? "");

    if (!email || !fullName) {
      return { ok: false, message: "Name and email are both required." };
    }
    if (password.length < 8) {
      return { ok: false, message: "Temporary password must be at least 8 characters." };
    }

    const db = createAdminClient();

    const makeUser = () =>
      db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, college: college || null, role: "ambassador" },
      });

    let { data: created, error } = await makeUser();

    /**
     * The orphaned-login case.
     *
     * Deleting somebody from `public.profiles` — in the SQL editor, or through
     * the dashboard's table view — leaves their `auth.users` row behind. The
     * address is then permanently taken: creating them again fails as "already
     * registered", while the ambassador list shows nobody to reset, so the
     * admin is stuck with no way out of the UI.
     *
     * An auth user with no profile cannot sign in to anything this app shows,
     * so it is safe to clear out and start again. Only ever for the exact
     * address being created, and only when the profile really is missing — a
     * real account keeps the original error.
     */
    if (error && /already|registered|exists/i.test(error.message)) {
      const { data: list } = await db.auth.admin.listUsers();
      const existing = list?.users.find(
        (u) => u.email?.toLowerCase() === email,
      );

      const { count: profiles } = existing
        ? await db
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("id", existing.id)
        : { count: null };

      if (existing && (profiles ?? 0) === 0) {
        const { error: removeError } = await db.auth.admin.deleteUser(existing.id);
        if (removeError) throw removeError;

        ({ data: created, error } = await makeUser());
      } else {
        return {
          ok: false,
          message: `${email} already has an account. Use "Reset password" on their row instead.`,
        };
      }
    }

    if (error) throw error;
    // Narrowing for the retry path: `created` is reassigned above, so TypeScript
    // can no longer see that a successful create always carries a user.
    if (!created?.user) {
      return { ok: false, message: "The account could not be created. Try again." };
    }

    // The trigger marks anyone created with a password as active. Walk that
    // back: they haven't chosen their own password yet.
    const { error: profileError } = await db
      .from("profiles")
      .update({
        status: "invited",
        must_change_password: true,
        full_name: fullName,
        city: city || null,
        batch: batch || null,
        // The signup trigger issues a random code before anyone knows the
        // batch, so the structured one is assigned here, where we do.
        referral_code: await nextReferralCode(db, batch),
      })
      .eq("id", created.user.id);

    if (profileError) {
      // Otherwise the address is taken by an account nobody can finish setting
      // up, and re-adding them just fails with "already registered".
      await db.auth.admin.deleteUser(created.user.id).catch(() => {});
      throw profileError;
    }

    await audit(actorId, "ambassador.create", "profile", created.user.id, { email });

    const emailResult = await sendAmbassadorWelcomeEmail({
      email,
      fullName,
      password,
    }).catch((error) => {
      console.error("Unexpected welcome email failure", error);
      return {
        ok: false as const,
        reason: "failed" as const,
        message: "Account created, but the welcome email could not be sent.",
      };
    });

    revalidatePath("/admin/ambassadors");
    return {
      ok: true,
      message: emailResult.ok
        ? `${fullName} added and emailed`
        : `${fullName} added - share the credentials below`,
      credentials: { email, password, fullName },
      emailDelivery: emailResult.ok
        ? { status: "sent", message: emailResult.message }
        : {
            status: emailResult.reason === "disabled" ? "skipped" : "failed",
            message: emailResult.message,
          },
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

    const emailResult = await sendAmbassadorWelcomeEmail({
      email: profile.email,
      fullName: profile.full_name || profile.email,
      password,
    }).catch((error) => {
      console.error("Unexpected reset-password email failure", error);
      return {
        ok: false as const,
        reason: "failed" as const,
        message: "Password reset, but the email could not be sent.",
      };
    });

    revalidatePath("/admin/ambassadors");
    return {
      ok: true,
      message: emailResult.ok
        ? "New temporary password set and emailed"
        : "New temporary password set - share the credentials below",
      credentials: {
        email: profile.email,
        password,
        fullName: profile.full_name || profile.email,
      },
      emailDelivery: emailResult.ok
        ? { status: "sent", message: emailResult.message }
        : {
            status: emailResult.reason === "disabled" ? "skipped" : "failed",
            message: emailResult.message,
          },
    };
  } catch (err) {
    return fail(err);
  }
}

// ─── Referrals ──────────────────────────────────────────────────────────────

/**
 * Sets an ambassador's confirmed download count by hand.
 *
 * The count stays *derived* from `referral_conversions` rather than becoming a
 * number stored on the profile. Typing 5 creates or voids rows until there are
 * five counted ones, so the ledger, the audit trail and the ambassador's own
 * screen all keep agreeing with each other. A second "true" count stored
 * alongside the real one is how those three drift apart.
 *
 * Only manually-created rows are ever voided. A conversion that came from a CSV
 * import is a record of something that actually happened, and this action will
 * not quietly delete it.
 */
export async function setReferralCount(
  profileId: string,
  count: number,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();

    if (!Number.isInteger(count) || count < 0 || count > 10_000) {
      return { ok: false, message: "Enter a whole number of downloads." };
    }

    const db = createAdminClient();

    const { data: profile } = await db
      .from("profiles")
      .select("referral_code, full_name")
      .eq("id", profileId)
      .maybeSingle();
    if (!profile) return { ok: false, message: "That ambassador no longer exists." };

    const { data: existing } = await db
      .from("referral_conversions")
      .select("id, source, converted_at")
      .eq("ambassador_id", profileId)
      .eq("status", "counted")
      .order("converted_at", { ascending: false });

    const counted = existing ?? [];
    const perReferral = await referralPoints();

    // ─── Add ────────────────────────────────────────────────────────────────
    if (count > counted.length) {
      const toAdd = count - counted.length;
      const rows = Array.from({ length: toAdd }, (_, i) => ({
        ambassador_id: profileId,
        code: profile.referral_code,
        // Unique per row, and stable enough that re-running can't double up.
        external_user_ref: `manual-${profileId}-${Date.now()}-${i}`,
        source: "manual" as const,
        status: "counted" as const,
      }));

      const { data: inserted, error } = await db
        .from("referral_conversions")
        .insert(rows)
        .select("id");
      if (error) throw error;

      if (perReferral > 0 && inserted?.length) {
        // Same idempotent source pair the rest of the ledger uses.
        await db.from("point_ledger").insert(
          inserted.map((row) => ({
            ambassador_id: profileId,
            delta: perReferral,
            reason: "referral" as const,
            source_type: "referral_conversion",
            source_id: row.id,
            note: "App download confirmed",
            created_by: actorId,
          })),
        );
      }

      // Past the threshold, later downloads are worth more. Runs after the
      // flat award so it tops up rather than replacing it, and it is a no-op
      // when nothing new is owed.
      await awardReferralBonus(profileId, actorId).catch(() => {});
      await evaluateBadges(profileId).catch(() => {});

      await notify({
        profileId,
        type: "referral_confirmed",
        title: `${toAdd} referral${toAdd === 1 ? "" : "s"} confirmed`,
        body:
          perReferral > 0
            ? `That's ${toAdd * perReferral} points.`
            : "Your download count went up.",
        href: "/dashboard/referrals",
        meta: { added: toAdd },
      }).catch(() => {});
    }

    // ─── Remove ─────────────────────────────────────────────────────────────
    if (count < counted.length) {
      const toRemove = counted.length - count;

      // Newest manual rows first; imported ones are only touched if there is
      // nothing manual left to void.
      const ordered = [
        ...counted.filter((c) => c.source === "manual"),
        ...counted.filter((c) => c.source !== "manual"),
      ].slice(0, toRemove);

      const ids = ordered.map((c) => c.id);

      const { error } = await db
        .from("referral_conversions")
        .update({ status: "void", notes: "Adjusted by an admin" })
        .in("id", ids);
      if (error) throw error;

      if (perReferral > 0) {
        // Compensating rows, never deletions — the original credit stays in
        // their history beside its reversal.
        await db.from("point_ledger").insert(
          ids.map((id) => ({
            ambassador_id: profileId,
            delta: -perReferral,
            reason: "revoke" as const,
            source_type: "referral_conversion",
            source_id: id,
            note: "Referral count corrected",
            created_by: actorId,
          })),
        );
      }

      // The multiplier uplift is owed on downloads past the threshold, so
      // taking downloads away has to recompute it too. Reversing only the flat
      // points left the bonus behind, paid for installs that had just been
      // voided — and the bigger the correction, the more of it survived.
      await awardReferralBonus(profileId, actorId).catch(() => {});
      await evaluateBadges(profileId).catch(() => {});
    }

    await audit(actorId, "referral.set_count", "profile", profileId, { count });

    revalidatePath("/admin/referrals");
    revalidatePath("/dashboard/referrals");
    return {
      ok: true,
      message:
        count === counted.length
          ? "No change"
          : `${profile.full_name || "Ambassador"} now shows ${count} download${count === 1 ? "" : "s"}`,
    };
  } catch (err) {
    return fail(err);
  }
}

/** Points per confirmed download, from settings. */
async function referralPoints(): Promise<number> {
  const { data } = await createAdminClient()
    .from("app_settings")
    .select("value")
    .eq("key", "points.referral")
    .maybeSingle();

  const parsed = Number(data?.value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
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
    const platform = String(formData.get("platform") ?? "Instagram").trim();

    if (!title || !instagramUrl) {
      return { ok: false, message: "Title and post URL are required." };
    }

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({
        title,
        instagram_url: instagramUrl,
        description: description || null,
        expected_handle: handle || "dailymattr",
        platform: platform || "Instagram",
        created_by: actorId,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw error;

    // The whole task list arrives as one JSON field rather than four fixed
    // `points_like`-style inputs, so a campaign can be built from any library
    // task on any network, renamed and reordered — the same shape the campaign
    // page edits afterwards.
    type DraftTask = {
      library_id?: string;
      label?: string;
      points?: number;
      required?: boolean;
      proof_type?: string;
    };

    let drafts: DraftTask[] = [];
    try {
      const raw = JSON.parse(String(formData.get("tasks") ?? "[]"));
      if (Array.isArray(raw)) drafts = raw as DraftTask[];
    } catch {
      return { ok: false, message: "Could not read the task list." };
    }

    const tasks = drafts
      .map((t, i) => ({
        library_id: t.library_id ? String(t.library_id) : null,
        label: String(t.label ?? "").trim(),
        points: Number(t.points ?? 0),
        required: Boolean(t.required),
        proof_type: String(t.proof_type ?? "screenshot"),
        order_index: i,
      }))
      // Zero points means "not part of this campaign", same as before. A task
      // needs a name; where it came from is the next problem, not this one.
      .filter((t) => t.label && Number.isFinite(t.points) && t.points > 0);

    if (tasks.length === 0) {
      return {
        ok: false,
        message: "Add at least one task worth more than zero points.",
      };
    }

    /**
     * Tasks somebody typed get filed in the library on the way past.
     *
     * `campaign_tasks_identified` requires either an enum type or a library
     * row, and the four enum values are reserved for campaigns that predate
     * the library — so a typed task has to become a library row. Which is the
     * right outcome anyway: the vocabulary grows from what the team actually
     * asks for rather than from a list somebody curated up front, and the
     * next campaign gets it as a suggestion.
     *
     * Matched case-insensitively on the same network first, so typing "Like
     * the reel" twice does not file it twice.
     */
    const existing = await supabase
      .from("task_library")
      .select("id, label, platform");

    for (const task of tasks) {
      if (task.library_id) continue;

      const match = (existing.data ?? []).find(
        (l) =>
          l.label.toLowerCase() === task.label.toLowerCase() &&
          (l.platform ?? "") === (platform || "Instagram"),
      );

      if (match) {
        task.library_id = match.id;
        continue;
      }

      const { data: created, error: libError } = await supabase
        .from("task_library")
        .insert({
          label: task.label,
          slug: `${slugify(task.label)}-${Date.now().toString(36)}`,
          platform: platform || "Instagram",
          default_points: task.points,
          proof_type: task.proof_type as Enums<"proof_type">,
          created_by: actorId,
        })
        .select("id")
        .single();

      if (libError || !created) {
        return { ok: false, message: `Couldn't save the task "${task.label}".` };
      }
      task.library_id = created.id;
    }

    const { error: taskError } = await supabase.from("campaign_tasks").insert(
      tasks.map((t) => ({
        campaign_id: campaign.id,
        // Library-backed, so `campaign_tasks_identified` is satisfied by
        // library_id and the four Instagram enum values stay reserved for the
        // campaigns that predate this.
        type: null,
        library_id: t.library_id,
        label_override: t.label || null,
        // Inherited from the campaign rather than chosen per task, so the two
        // can never disagree.
        platform: platform || "Instagram",
        proof_type: t.proof_type as Enums<"proof_type">,
        points: t.points,
        order_index: t.order_index,
        required: t.required,
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
  /** Multi-choice only. null = no limit. */
  max_select?: number | null;
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
  /** Survey-wide ceiling. Null means keep going. Ignored for participant surveys. */
  responseCap: number | null;
  audience: Enums<"survey_audience">;
  questions: SurveyQuestionInput[];
}): Promise<ActionResult & { surveyId?: string }> {
  try {
    const actorId = await assertAdmin();
    const supabase = await createClient();

    const title = input.title.trim();
    if (!title) return { ok: false, message: "Give the survey a title." };

    const participant = input.audience === "participant";

    // A participant survey is one answer per ambassador, so a survey-wide
    // ceiling would mean the first few people to respond used up everybody
    // else's turn. Stored as null rather than refused, so switching the
    // audience does not make the admin go back and clear a field.
    const cap = participant ? null : input.responseCap;

    if (cap !== null && (!Number.isInteger(cap) || cap < 1)) {
      return {
        ok: false,
        message: "Responses needed must be a whole number, or left blank.",
      };
    }

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
        // A signed-in ambassador is already identified, so a participant
        // survey never asks them to type an email or phone number.
        require_email: participant ? false : input.requireEmail,
        require_phone: participant ? false : input.requirePhone,
        response_cap: cap,
        audience: input.audience,
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
        // Only multi-choice can carry a cap; anything else stores null so a
        // stray value on a text question can never limit anything.
        max_select:
          q.type === "multi_choice" && q.max_select && q.max_select > 0
            ? q.max_select
            : null,
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
