import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

/**
 * "View as ambassador" — the admin preview of a student's screens.
 *
 * The ambassador pages were unusable to an admin. Every read model is keyed to
 * `auth.uid()`, and an admin owns none of the rows those keys select: no survey
 * link, no submission, no ledger entry. So Tasks showed campaigns with "Done
 * 0/1" and silently dropped every survey, the dashboard showed 0%, and the page
 * carried a banner explaining that the emptiness was expected. An admin
 * checking "what do students see" was shown the one thing no student sees.
 *
 * This resolves a *viewer* — the id whose rows the ambassador screens read —
 * separately from the *actor*, the account actually signed in. Normally they
 * are the same id. An admin who picks somebody gets that student's viewer id
 * while remaining the actor, and every read model follows without knowing this
 * module exists beyond asking who to read for.
 *
 * Three rules hold it together:
 *
 *  - Admin only. The cookie is inert for anybody else, so a student who forges
 *    one reads their own rows exactly as before. The check is a live profile
 *    read, not a claim carried in the cookie.
 *  - Ambassadors only, and real ones. An id that names no active ambassador is
 *    ignored rather than trusted.
 *  - Read-only. `assertNotViewingAs` guards every ambassador-side write, so a
 *    preview can never file a submission, spend points or mark a notification.
 *    Nothing here grants access either: RLS already lets an admin read these
 *    tables, and impersonating a student would *narrow* what they can see.
 */

/** Session-scoped, so closing the browser ends the preview. */
export const VIEW_AS_COOKIE = "dm_view_as";

export type Viewer = {
  /** Whose rows the ambassador screens should read. */
  id: string;
  /** True when an admin is previewing somebody else. */
  isPreview: boolean;
  /** The previewed student's name, for the banner. Null when not previewing. */
  subjectName: string | null;
};

/**
 * Who the ambassador screens are reading for.
 *
 * Cached per request: the layout and the page inside it both need it, and it
 * costs a profile read.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const self: Viewer = { id: user.id, isPreview: false, subjectName: null };

  const target = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!target || target === user.id) return self;

  // The actor's own role, read fresh. A cookie never says who may preview.
  const { data: actor } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (actor?.role !== "admin" || actor.status !== "active") return self;

  // The subject must be a real ambassador. A stale id — someone since deleted
  // or promoted — falls back to the admin's own view rather than rendering a
  // half-empty page nobody can explain.
  const { data: subject } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", target)
    .maybeSingle();

  if (!subject || subject.role !== "ambassador") return self;

  return {
    id: subject.id,
    isPreview: true,
    subjectName: subject.full_name || "this ambassador",
  };
});

/**
 * The id the ambassador read models should key on. Falls back to the signed-in
 * user, and is null only when signed out.
 */
export async function viewerId(): Promise<string | null> {
  return (await getViewer())?.id ?? null;
}

/**
 * Refuse a write while previewing.
 *
 * Every ambassador-side action writes rows stamped with `auth.uid()`, which is
 * the *admin* — so an unguarded upload during a preview would file a
 * submission owned by the admin against a student's task, and land in the
 * review queue as real work. Throwing keeps the preview what it claims to be.
 */
export async function assertNotViewingAs(): Promise<void> {
  const viewer = await getViewer();
  if (viewer?.isPreview) {
    throw new Error(
      "You are previewing an ambassador's view. Stop the preview before doing anything that writes.",
    );
  }
}
