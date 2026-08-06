import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * The landing point for a password-reset link.
 *
 * The token is exchanged for a session HERE, on the server, so the session
 * cookie is set by `@supabase/ssr` and no access token is ever placed in a URL
 * fragment for client JavaScript to pick up. That is the difference between
 * this and Supabase's default implicit flow, and it is why the emailed link
 * points at us rather than at Supabase's verify endpoint.
 *
 * A used, expired or forged token lands on /forgot-password with a message
 * rather than a blank screen — the most common way to arrive here with a bad
 * token is clicking a link twice.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");

  if (!tokenHash) redirect("/forgot-password?error=missing");

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });

  if (error) redirect("/forgot-password?error=expired");

  redirect("/reset-password");
}
