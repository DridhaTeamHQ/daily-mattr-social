import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * There is no marketing page here — this app is only ever reached by an
 * ambassador who already has an account, or an admin.
 *
 * The role check matters. Sending everyone to /dashboard put a signed-in admin
 * on the ambassador view, where they have no points, no referral code and no
 * survey links, so the most prominent thing on the screen is the banner
 * explaining why it looks empty. `login/actions.ts` already routes by role
 * after sign-in; this is the same rule for anyone arriving at the bare domain
 * with a session already in place.
 *
 * Signed out, this still falls through to /dashboard and `proxy.ts` bounces
 * them to sign-in from there.
 */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  redirect(profile?.role === "admin" ? "/admin" : "/dashboard");
}
