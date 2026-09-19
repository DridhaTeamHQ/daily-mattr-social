import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveVersion, getViewingVersion } from "@/lib/programme-version";

/**
 * Shared guards and error shaping for admin actions.
 *
 * These live OUTSIDE any `"use server"` module deliberately. In a file marked
 * `"use server"` every export must be an async function, and each one becomes
 * a callable server action — a public endpoint. `fail()` is synchronous, so
 * exporting it from `actions.ts` broke the whole module at build time; and
 * `assertAdmin()`, while async, has no business being reachable over the wire.
 *
 * Keeping them here means both can be imported by any action file without
 * either becoming part of the app's attack surface.
 */

export type ActionResult = { ok: boolean; message: string };

/**
 * Throws unless the caller is an active admin. Returns their id.
 *
 * Every action that touches the service-role client starts with this. That
 * client bypasses RLS entirely, so this check is the only thing standing
 * between a signed-in student and the points ledger.
 */
export async function assertAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.status !== "active") {
    throw new Error("Not authorised");
  }
  return user.id;
}

/**
 * Throws unless the caller is an active admin *and* the console is pointed at
 * the run that is open. Returns their id.
 *
 * Every admin mutation goes through this rather than `assertAdmin` alone.
 * Reads may look at an earlier run — that is the whole point of keeping it —
 * but writes may not, and the reason is that a write while looking backwards
 * would not even do what the screen implied. A new row's run comes from the
 * database default, which is always the open one, so voiding an install from
 * V1's installs page would read V1's numbers, decide how many rows to change,
 * and then write the difference into V2. Refusing is the only honest outcome.
 *
 * `assertAdmin` is deliberately left alone: the cached read client calls it
 * before every render, and adding this check there would make looking at an
 * earlier run impossible rather than read-only.
 */
export async function assertAdminWrite(): Promise<string> {
  const actorId = await assertAdmin();

  const [viewing, active] = await Promise.all([
    getViewingVersion(),
    getActiveVersion(),
  ]);

  if (viewing !== active) {
    throw new Error(
      "You are looking at an earlier run of the programme, which is read-only. Switch back to the current one to make changes.",
    );
  }

  return actorId;
}

export function fail(err: unknown): ActionResult {
  // Supabase's PostgrestError is a plain object, not an Error subclass, so an
  // `instanceof Error` check alone swallows the only useful diagnostic and
  // reports "Something went wrong" for every database failure.
  if (err instanceof Error) return { ok: false, message: err.message };

  if (err && typeof err === "object" && "message" in err) {
    const { message, hint } = err as { message?: unknown; hint?: unknown };
    if (typeof message === "string" && message) {
      return {
        ok: false,
        message: typeof hint === "string" && hint ? `${message} (${hint})` : message,
      };
    }
  }

  return { ok: false, message: "Something went wrong" };
}
