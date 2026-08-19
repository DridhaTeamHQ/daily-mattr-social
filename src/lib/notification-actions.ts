"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { assertNotViewingAs } from "@/lib/view-as";

/**
 * Marking notifications read.
 *
 * `notifications_update_own` is the only write policy students have on this
 * table, and it is scoped to their own rows, so the RLS client is enough. The
 * update sets nothing but `read_at` — the Update type in database.types.ts
 * makes anything else a compile error.
 *
 * The bell shows the previewed student's notifications, so both actions refuse
 * while a preview is running. RLS would refuse the write anyway — there is no
 * admin update policy here — but silently doing nothing looks like a bug in
 * the bell rather than the preview declining to touch somebody's data.
 */

export async function markNotificationRead(id: string): Promise<void> {
  await assertNotViewingAs();

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);

  revalidatePath("/dashboard", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  await assertNotViewingAs();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", user.id)
    .is("read_at", null);

  revalidatePath("/dashboard", "layout");
}
