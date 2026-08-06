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
