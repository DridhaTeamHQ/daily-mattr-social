"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin, fail, type ActionResult } from "@/lib/admin/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Enums } from "@/lib/database.types";

/**
 * The Task/Activity Library.
 *
 * A task is a row, so adding "post on LinkedIn" costs an insert rather than a
 * migration. Campaigns then get assembled from these instead of retyped, which
 * is the whole point of 9.1 calling it a library.
 */

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

export async function createLibraryTask(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();

    const label = String(formData.get("label") ?? "").trim();
    const platform = String(formData.get("platform") ?? "").trim();
    const instructions = String(formData.get("instructions") ?? "").trim();
    const proofType = String(formData.get("proof_type") ?? "screenshot");
    const cadence = String(formData.get("cadence") ?? "once");
    const points = Number(formData.get("default_points") ?? 10);

    if (label.length < 3) {
      return { ok: false, message: "Give the task a name." };
    }
    if (!Number.isInteger(points) || points < 0 || points > 10_000) {
      return { ok: false, message: "Points must be a whole number." };
    }

    const db = createAdminClient();
    const slug = slugify(label);

    if (!slug) {
      return { ok: false, message: "That name has no letters or numbers in it." };
    }

    const { error } = await db.from("task_library").insert({
      slug,
      label,
      platform: platform || null,
      instructions: instructions || null,
      proof_type: proofType as Enums<"proof_type">,
      cadence: cadence as Enums<"task_cadence">,
      default_points: points,
      created_by: actorId,
    });

    if (error) {
      // The slug is unique, and colliding on it means the label already exists
      // in all but punctuation. Saying so beats a constraint name.
      if (error.code === "23505") {
        return { ok: false, message: `"${label}" is already in the library.` };
      }
      throw error;
    }

    revalidatePath("/admin/library");
    return { ok: true, message: `Added "${label}".` };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Retires a task instead of deleting it.
 *
 * `campaign_tasks.library_id` is ON DELETE RESTRICT, so a task used by any
 * campaign cannot be removed — and shouldn't be, because deleting it would
 * erase what a past campaign actually asked people to do. Deactivating keeps
 * the history and takes it out of the picker.
 */
export async function setLibraryTaskActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    await assertAdmin();

    const db = createAdminClient();
    const { error } = await db
      .from("task_library")
      .update({ active })
      .eq("id", id);
    if (error) throw error;

    revalidatePath("/admin/library");
    return { ok: true, message: active ? "Back in the library." : "Retired." };
  } catch (err) {
    return fail(err);
  }
}

export async function updateLibraryTaskPoints(
  id: string,
  points: number,
): Promise<ActionResult> {
  try {
    await assertAdmin();

    if (!Number.isInteger(points) || points < 0 || points > 10_000) {
      return { ok: false, message: "Points must be a whole number." };
    }

    const db = createAdminClient();
    const { error } = await db
      .from("task_library")
      .update({ default_points: points })
      .eq("id", id);
    if (error) throw error;

    // Only the DEFAULT changes. Campaigns already built keep the points they
    // were created with, because changing what a live campaign pays out from
    // under the students doing it would be indefensible.
    revalidatePath("/admin/library");
    return { ok: true, message: "Default updated. Live campaigns are unchanged." };
  } catch (err) {
    return fail(err);
  }
}
