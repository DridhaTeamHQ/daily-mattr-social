"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null };

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Supabase returns the same message for a wrong password and an unknown
    // address, which is what we want — it stops the form being used to find
    // out who has an account.
    return { error: "That email and password don't match an account." };
  }

  // Admins have no points and don't appear on the leaderboard, so the
  // ambassador dashboard is a confusing place to land them.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  const home = profile?.role === "admin" ? "/admin" : "/dashboard";

  revalidatePath("/", "layout");

  // Only ever redirect to a path on this site: an attacker-supplied `next` of
  // https://evil.example would otherwise make this an open redirect.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : null;

  redirect(safeNext && safeNext !== "/dashboard" ? safeNext : home);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
