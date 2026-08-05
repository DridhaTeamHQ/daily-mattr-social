"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { fail, type ActionResult } from "@/lib/admin/guards";

/**
 * A student asking to turn points into cash.
 *
 * The row is written with the *user's* client so the RLS insert policy applies
 * — it pins `ambassador_id` to `auth.uid()` and forces the status to
 * 'requested', which means this action cannot create an approved request even
 * if the code below were wrong.
 *
 * Nothing is deducted here. Points come off only when an admin approves, and
 * the balance is re-checked at that moment. Burning them at request time would
 * mean a declined request had to be refunded, and a refund path is one more
 * thing to get wrong.
 */
export async function requestRedemption(
  points: number,
  payeeRef: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "Sign in first." };

    const settings = await getSettings("points_per_rupee", "min_redemption_points");
    const rate = settings.points_per_rupee || 10;

    if (!Number.isInteger(points) || points <= 0) {
      return { ok: false, message: "Enter a whole number of points." };
    }
    if (points < settings.min_redemption_points) {
      return {
        ok: false,
        message: `The smallest redemption is ${settings.min_redemption_points} points.`,
      };
    }

    const upi = payeeRef.trim();
    if (upi.length < 3) {
      return { ok: false, message: "Add the UPI id the money should go to." };
    }

    // Balance from the ledger, and open requests subtracted from it. Without
    // that second half someone could send five separate requests for their
    // whole balance and have every one of them look coverable.
    // Filtered by id, not left to RLS: an admin's policy grants SELECT over
    // every row, so an unfiltered sum here would be the whole programme's
    // balance rather than one person's.
    const [{ data: ledger }, { data: open }] = await Promise.all([
      supabase.from("point_ledger").select("delta").eq("ambassador_id", user.id),
      supabase
        .from("redemption_requests")
        .select("points")
        .eq("ambassador_id", user.id)
        .in("status", ["requested", "approved"]),
    ]);

    const balance = (ledger ?? []).reduce((sum, row) => sum + row.delta, 0);
    const reserved = (open ?? []).reduce((sum, row) => sum + row.points, 0);
    const available = balance - reserved;

    if (points > available) {
      return {
        ok: false,
        message:
          reserved > 0
            ? `You have ${available} points free — ${reserved} are already in a pending request.`
            : `You only have ${balance} points.`,
      };
    }

    const { error } = await supabase.from("redemption_requests").insert({
      ambassador_id: user.id,
      points,
      amount_inr: Math.floor(points / rate),
      payee_ref: upi,
      method: "upi",
    });
    if (error) throw error;

    // Best-effort nudge to the admins. A failure here must not fail the
    // request the student just made.
    try {
      const db = createAdminClient();
      const { data: admins } = await db
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .eq("status", "active");

      if (admins?.length) {
        await db.from("notifications").insert(
          admins.map((admin) => ({
            profile_id: admin.id,
            type: "account" as const,
            title: "New redemption request",
            body: `${points} points → ₹${Math.floor(points / rate)}`,
            href: "/admin/stipend",
          })),
        );
      }
    } catch {
      // Ignored on purpose — see above.
    }

    revalidatePath("/dashboard/rewards");
    revalidatePath("/admin/stipend");

    return {
      ok: true,
      message: `Requested ₹${Math.floor(points / rate)}. An admin will review it.`,
    };
  } catch (err) {
    return fail(err);
  }
}
