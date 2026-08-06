"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResetState = { error: string | null };

/**
 * Sets a new password for whoever the recovery session belongs to.
 *
 * There is no "current password" field, and there should not be: the person
 * proved control of the mailbox by following the emailed link, which is the
 * whole point of a reset. Asking for the password they have forgotten would
 * make the flow useless.
 */
export async function resetPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    return { error: "Include at least one letter and one number." };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The recovery session is the only authorisation this action has. Without it
  // there is nobody to update, and updateUser would silently apply to whoever
  // happened to be signed in.
  if (!user) {
    return { error: "That reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return {
      error: /same/i.test(error.message)
        ? "That's already your password. Pick a different one."
        : error.message,
    };
  }

  // Someone arriving through a reset has, by definition, chosen their own
  // password — so the temporary-password flag comes off and the account goes
  // active, the same as finishing the welcome flow.
  await createAdminClient()
    .from("profiles")
    .update({ must_change_password: false, status: "active" })
    .eq("id", user.id)
    .eq("status", "invited");

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
