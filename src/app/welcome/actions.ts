"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { invalidateAdminCache } from "@/lib/cache/admin-generation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type WelcomeState = { error: string | null };

/**
 * Replaces an admin-issued temporary password with the student's own, then
 * activates the account.
 *
 * `status` and `must_change_password` are written with the service-role client
 * because 0009 makes both immutable to non-admins — otherwise a student could
 * flip the flag and keep using the password their admin knows.
 */
export async function setOwnPassword(
  _prev: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Those two passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Supabase rejects a password identical to the current one, which is
    // exactly what someone re-typing the temporary password would hit.
    return {
      error: /different|same/i.test(error.message)
        ? "Pick something different from the password you were given."
        : error.message,
    };
  }

  const { error: profileError } = await createAdminClient()
    .from("profiles")
    .update({ must_change_password: false, status: "active" })
    .eq("id", user.id);
  if (profileError) {
    return { error: "Password changed, but activating the account failed. Tell your admin." };
  }

  await invalidateAdminCache();
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
