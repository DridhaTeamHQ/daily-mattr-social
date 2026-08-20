"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin, fail, type ActionResult } from "@/lib/admin/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Enums } from "@/lib/database.types";

/**
 * Managing the tasks on an existing campaign.
 *
 * A campaign used to be four fixed Instagram actions decided at creation and
 * frozen forever. Real campaigns run across networks and get adjusted, so
 * tasks can now be added, repriced and removed.
 *
 * The one thing that is NOT allowed is removing a task somebody has already
 * submitted against. Deleting it would orphan their screenshot and the ledger
 * row that paid for it — the work happened, and a campaign edit is not a
 * reason to erase it. Those get deactivated in the UI instead by dropping
 * their points to zero, which stops new submissions without rewriting history.
 */

export async function addCampaignTask(
  campaignId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertAdmin();

    const libraryId = String(formData.get("library_id") ?? "").trim();
    const label = String(formData.get("label") ?? "").trim();
    const platform = String(formData.get("platform") ?? "").trim();
    const points = Number(formData.get("points") ?? 0);
    const instructions = String(formData.get("instructions") ?? "").trim();
    const proofType = String(formData.get("proof_type") ?? "screenshot");
    const required = formData.get("required") === "on";

    if (!Number.isInteger(points) || points < 0 || points > 10_000) {
      return { ok: false, message: "Points must be a whole number." };
    }
    // A task must come from the library. `campaign_tasks_identified` requires
    // exactly one of (type, library_id), and the alternative — inventing an
    // enum value like "share" for a Reddit comment — would make every report
    // that groups by type quietly wrong. Renaming happens via label_override.
    if (!libraryId) {
      return { ok: false, message: "Pick a task from the library." };
    }

    const db = createAdminClient();

    const { data: existing } = await db
      .from("campaign_tasks")
      .select("order_index")
      .eq("campaign_id", campaignId)
      .order("order_index", { ascending: false })
      .limit(1);

    const nextIndex = (existing?.[0]?.order_index ?? -1) + 1;

    // A library task is identified by library_id; a custom one carries its own
    // label. The `campaign_tasks_identified` constraint requires exactly one
    // of (type, library_id), so a custom task borrows the library row it was
    // built from, or none at all when it is genuinely bespoke.
    const { error } = await db.from("campaign_tasks").insert({
      campaign_id: campaignId,
      type: null,
      library_id: libraryId,
      label_override: label || null,
      platform: platform || null,
      points,
      instructions: instructions || null,
      proof_type: proofType as Enums<"proof_type">,
      required,
      order_index: nextIndex,
    });
    if (error) throw error;

    revalidatePath(`/admin/campaigns/${campaignId}`);
    revalidatePath("/dashboard/campaigns");

    return { ok: true, message: "Task added." };
  } catch (err) {
    return fail(err);
  }
}

export async function updateCampaignTask(
  taskId: string,
  campaignId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertAdmin();

    const points = Number(formData.get("points") ?? 0);
    const label = String(formData.get("label") ?? "").trim();
    const platform = String(formData.get("platform") ?? "").trim();
    const instructions = String(formData.get("instructions") ?? "").trim();
    const required = formData.get("required") === "on";

    if (!Number.isInteger(points) || points < 0 || points > 10_000) {
      return { ok: false, message: "Points must be a whole number." };
    }

    const db = createAdminClient();

    const { error } = await db
      .from("campaign_tasks")
      .update({
        points,
        label_override: label || null,
        platform: platform || null,
        instructions: instructions || null,
        required,
      })
      .eq("id", taskId);
    if (error) throw error;

    revalidatePath(`/admin/campaigns/${campaignId}`);
    revalidatePath("/dashboard/campaigns");

    // Said plainly, because it is the surprising half: already-approved work
    // keeps whatever it was paid, and only future approvals use the new value.
    return {
      ok: true,
      message: "Task updated. Points already paid are unchanged.",
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Editing every task on a campaign in one save, published or not.
 *
 * Publishing is not a freeze. A live campaign is exactly the one you find the
 * typo in, and "required" is the field most often wrong the moment real
 * ambassadors start reading the ask — so the form stays open for the whole
 * life of the campaign rather than only while it is a draft.
 *
 * Validation runs over every row BEFORE the first write. A half-applied save
 * where the first three tasks changed and the fourth failed is worse than a
 * refusal, because nothing on screen tells you which half landed.
 */
export async function updateCampaignTasks(
  campaignId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertAdmin();

    // The id list is what says which tasks were on the form. It cannot be
    // derived from the other fields: an unchecked checkbox submits nothing at
    // all, so "required is absent" and "the task wasn't there" look identical
    // without it — and guessing wrong silently un-requires a task.
    const ids = formData
      .getAll("task_id")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return { ok: true, message: "No tasks to update." };
    }

    const edits = [];

    for (const id of ids) {
      const points = Number(formData.get(`points:${id}`) ?? 0);
      const label = String(formData.get(`label:${id}`) ?? "").trim();
      const instructions = String(formData.get(`instructions:${id}`) ?? "").trim();
      const required = formData.get(`required:${id}`) === "on";

      if (!Number.isInteger(points) || points < 0 || points > 10_000) {
        return {
          ok: false,
          message: "Points must be a whole number between 0 and 10,000.",
        };
      }

      edits.push({ id, points, label, instructions, required });
    }

    const db = createAdminClient();

    for (const edit of edits) {
      const { error } = await db
        .from("campaign_tasks")
        .update({
          points: edit.points,
          // Empty clears the rename, which drops the task back to the label
          // its library row carries. That is the only way to undo a rename.
          label_override: edit.label || null,
          instructions: edit.instructions || null,
          required: edit.required,
        })
        .eq("id", edit.id)
        // Scoped to the campaign being edited, so a task id from somewhere
        // else cannot be smuggled in through the form.
        .eq("campaign_id", campaignId);
      if (error) throw error;
    }

    revalidatePath("/admin/campaigns");
    revalidatePath(`/admin/campaigns/${campaignId}`);
    revalidatePath("/dashboard/campaigns");

    return {
      ok: true,
      message: `${edits.length} task${edits.length === 1 ? "" : "s"} updated. Points already paid are unchanged.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function removeCampaignTask(
  taskId: string,
  campaignId: string,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const db = createAdminClient();

    const { count } = await db
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("campaign_task_id", taskId);

    if ((count ?? 0) > 0) {
      return {
        ok: false,
        message: `${count} submission${count === 1 ? " has" : "s have"} been made against this task, so it can't be deleted. Set its points to zero to close it instead.`,
      };
    }

    const { error } = await db.from("campaign_tasks").delete().eq("id", taskId);
    if (error) throw error;

    revalidatePath(`/admin/campaigns/${campaignId}`);
    revalidatePath("/dashboard/campaigns");

    return { ok: true, message: "Task removed." };
  } catch (err) {
    return fail(err);
  }
}
