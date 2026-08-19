"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * Starting and stopping the ambassador preview.
 *
 * The cookie is the whole mechanism, so the check that guards it lives here
 * and is a live profile read: nothing about who may preview is ever taken
 * from the cookie itself, and a non-admin calling this action directly gets
 * the same refusal as one who never found it.
 */

/** Who an admin can preview, for the picker. */
export type PreviewablePerson = { id: string; name: string; college: string | null };

export async function listPreviewablePeople(): Promise<PreviewablePerson[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: actor } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (actor?.role !== "admin" || actor.status !== "active") return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, college")
    .eq("role", "ambassador")
    .eq("status", "active")
    .order("full_name");

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name || "Unnamed",
    college: p.college,
  }));
}

export async function startViewingAs(formData: FormData): Promise<void> {
  const target = String(formData.get("ambassadorId") ?? "");
  if (!target) return;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: actor } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (actor?.role !== "admin" || actor.status !== "active") return;

  // The subject must be a real, active ambassador — checked before the cookie
  // is written rather than only when it is read, so a bad id never gets stored.
  const { data: subject } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", target)
    .maybeSingle();
  if (!subject || subject.role !== "ambassador") return;

  const store = await cookies();
  store.set(VIEW_AS_COOKIE, subject.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // No maxAge: the preview ends with the browser session, so nobody comes
    // back tomorrow still wearing somebody else's dashboard.
  });

  revalidatePath("/dashboard", "layout");
}

export async function stopViewingAs(): Promise<void> {
  const store = await cookies();
  store.delete(VIEW_AS_COOKIE);
  revalidatePath("/dashboard", "layout");
}
