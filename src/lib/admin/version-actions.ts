"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { assertAdmin, fail, type ActionResult } from "@/lib/admin/guards";
import { invalidateAdminCache } from "@/lib/cache/admin-generation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  VERSION_COOKIE,
  getActiveVersion,
  listVersions,
} from "@/lib/programme-version";

/**
 * Starting a new run of the programme, and looking back at an old one.
 *
 * ─── What starting a run does, and what it very deliberately does not ──────
 *
 * It writes a row in `programme_versions` for the new run, an end stamp on the
 * one it replaces, and calls `switch_programme_version()` (migration 0053),
 * which moves the ongoing work into the new run and points new work at it.
 *
 * Nothing is deleted. Rows change which run they are counted in; nothing else
 * about them is touched.
 *
 * ─── What carries across ───────────────────────────────────────────────────
 *
 * Everything except installs: campaigns, surveys, submissions, responses,
 * task and survey points, badges, achievements — plus the ambassadors, the
 * task library and every threshold in app_settings.
 *
 * What starts empty is installs: referral conversions and clicks, and the
 * points they earned. They stay in the run they were recorded in, which is
 * how an earlier run's install totals stay readable through the switcher.
 *
 * ─── It is reversible ──────────────────────────────────────────────────────
 *
 * Because nothing is destroyed, opening the wrong run is a setting away from
 * being put back. `setActiveVersion` exists for exactly that, and says so
 * loudly rather than pretending the decision is final.
 */

/** A label a person would actually type. */
function readLabel(raw: unknown, fallback: string): string {
  const label = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!label) return fallback;
  return label.slice(0, 40);
}

/**
 * Opens the next run.
 *
 * The id is one past the highest that exists rather than one past the active
 * one, so re-opening V1 to fix a mistake and then starting again does not try
 * to create a V2 that is already there.
 */
export async function startNextVersion(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const db = createAdminClient();

    const versions = await listVersions();
    const highest = versions.reduce((max, entry) => Math.max(max, entry.id), 0);
    const nextId = highest + 1;

    if (nextId > 999) {
      return { ok: false, message: "That is as many runs as the schema holds." };
    }

    const label = readLabel(formData.get("label"), `V${nextId}`);
    const description =
      String(formData.get("description") ?? "").trim().slice(0, 300) || null;

    const now = new Date().toISOString();
    const previous = await getActiveVersion();

    const { error: insertError } = await db.from("programme_versions").insert({
      id: nextId,
      label,
      description,
      started_at: now,
      created_by: actorId,
    });
    if (insertError) throw insertError;

    // The switch is written before the end stamp on purpose. If the stamp
    // fails, the worst case is a previous run with no end date — cosmetic. If
    // the switch failed after the stamp, a run would read as finished while
    // still taking every new row, which is the confusing half of the pair.
    const { error: settingError } = await db.rpc("switch_programme_version", {
      p_to: nextId,
      p_actor: actorId,
    });
    if (settingError) throw settingError;

    const { error: stampError } = await db
      .from("programme_versions")
      .update({ ended_at: now })
      .eq("id", previous)
      .is("ended_at", null);
    if (stampError) throw stampError;

    await db.from("audit_log").insert({
      actor_id: actorId,
      action: "programme.version_start",
      entity_type: "programme_version",
      entity_id: String(nextId),
      meta: { label, previous } as never,
    });

    await invalidateAdminCache();
    revalidateEverything();

    return {
      ok: true,
      message: `${label} is open. Everything from before it is kept and still readable.`,
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Opens an existing run — a prepared one, or an earlier one as an undo.
 *
 * The ongoing work moves with it, exactly as when a run is started; installs
 * stay in the run they were recorded in.
 */
export async function setActiveVersion(id: number): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();

    if (!Number.isInteger(id) || id < 1) {
      return { ok: false, message: "That is not a run." };
    }

    const versions = await listVersions();
    const target = versions.find((entry) => entry.id === id);
    if (!target) return { ok: false, message: "There is no such run." };

    const previous = await getActiveVersion();
    if (previous === id) {
      return { ok: true, message: `${target.label} is already the open run.` };
    }

    const db = createAdminClient();

    // Moves the ongoing work (campaigns, surveys, submissions, task points)
    // into the run being opened and points new work at it, in one
    // transaction. Installs stay in the run they were recorded in.
    const { error } = await db.rpc("switch_programme_version", {
      p_to: id,
      p_actor: actorId,
    });
    if (error) throw error;

    // The run being left is finished from this moment.
    await db
      .from("programme_versions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", previous)
      .is("ended_at", null);

    // Re-opening a run clears the end stamp it was given when it was closed:
    // it is running again, and a finished date on a live run is a date that
    // is not true.
    //
    // The start is stamped only when it is missing. A run that has never been
    // opened is starting now, and the students' "new season" notice counts
    // its fortnight from this moment — so a season prepared in September and
    // launched in October announces itself in October. A run that has run
    // before keeps the date it actually began; re-opening V1 does not mean V1
    // started today.
    await db
      .from("programme_versions")
      .update({
        ended_at: null,
        ...(target.startedAt ? {} : { started_at: new Date().toISOString() }),
      })
      .eq("id", id);

    await db.from("audit_log").insert({
      actor_id: actorId,
      action: "programme.version_activate",
      entity_type: "programme_version",
      entity_id: String(id),
      meta: { previous } as never,
    });

    await invalidateAdminCache();
    revalidateEverything();

    return { ok: true, message: `New work now belongs to ${target.label}.` };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Which run the admin console reads.
 *
 * A cookie rather than a query parameter, because this governs every admin
 * screen at once and a parameter would be dropped by the first link that
 * forgot to carry it — landing an admin on live figures under a heading that
 * still said they were reading history. Session-scoped, so nobody comes back
 * tomorrow still looking at last year.
 */
export async function setViewingVersion(id: number): Promise<ActionResult> {
  try {
    await assertAdmin();

    const versions = await listVersions();
    const target = versions.find((entry) => entry.id === id);
    if (!target) return { ok: false, message: "There is no such run." };

    const store = await cookies();

    if (target.isActive) {
      // The open run is the default, so it is the absence of a cookie rather
      // than a cookie naming it. One fewer state that can go stale.
      store.delete(VERSION_COOKIE);
    } else {
      store.set(VERSION_COOKIE, String(id), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }

    revalidateEverything();
    return { ok: true, message: `Showing ${target.label}.` };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Every admin screen carries figures scoped to a run, and the student screens
 * read the open one, so changing either is a change to all of them.
 */
function revalidateEverything(): void {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/stats");
}
