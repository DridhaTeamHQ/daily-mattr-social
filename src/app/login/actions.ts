"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isTempPasswordExpired } from "@/lib/temp-password";
import { isReplacedAmbassador } from "@/lib/admin/suspensions";

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
    .select("role, status, must_change_password, temp_password_expires_at")
    .eq("id", data.user.id)
    .maybeSingle();

  // Suspended and replaced: somebody new has their code, so there is nothing
  // here for them any more. Signed back out, like an expired link below.
  if (profile?.status === "suspended" && (await isReplacedAmbassador(data.user.id))) {
    await supabase.auth.signOut();
    redirect("/no-longer-member");
  }

  // A temporary password past its 5 days (0059). The password was right, so
  // this is not a "wrong password" — it is a login that has run out, and the
  // page says so and who to ask for a new one. Signed straight back out, or
  // the session would carry them past the expiry anyway.
  if (profile && isTempPasswordExpired(profile)) {
    await supabase.auth.signOut();
    redirect("/link-expired");
  }

  const home = profile?.role === "admin" ? "/admin" : "/dashboard";

  revalidatePath("/", "layout");

  // Only ever redirect to a path on this site: an attacker-supplied `next` of
  // https://evil.example would otherwise make this an open redirect.
  //
  // The `//` guard alone was not enough. Browsers treat a backslash as a
  // slash when resolving a URL, so `/\evil.example` passes "starts with one
  // slash, not two" and then navigates to //evil.example — an open redirect
  // on the page people arrive at holding a fresh session. A control character
  // does the same trick, so the whole shape is checked rather than the first
  // two bytes: one leading slash, and nothing that can be read as an
  // authority.
  const safeNext = isLocalPath(next) ? next : null;

  redirect(safeNext && safeNext !== "/dashboard" ? safeNext : home);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Is this a path on our own site, and nothing else?
 *
 * `next.startsWith("/") && !next.startsWith("//")` was the old test and it is
 * one character short. A browser resolving a URL treats a backslash as a
 * slash, so `/\evil.example` satisfies "one slash, not two" and then
 * navigates to //evil.example — an open redirect landing on the page a user
 * reaches holding a brand new session. Control characters and whitespace are
 * stripped or ignored by parsers in ways that reopen the same trick, so the
 * rule is stated positively instead: one leading slash, a first character
 * that cannot begin an authority, and no character that a parser might drop.
 */
function isLocalPath(next: string): boolean {
  // No regex: the escaping needed to express "not a backslash" inside a
  // character class is exactly the kind of thing that silently compiles to
  // something else. Spelled out, it cannot be misread.
  if (next.length < 2) return false;
  if (next[0] !== "/") return false;
  if (next[1] === "/" || next[1] === "\\") return false;


  for (const ch of next) {
    const code = ch.charCodeAt(0);
    // C0 controls, space, and DEL.
    if (code <= 0x20 || code === 0x7f) return false;
  }

  return true;
}
