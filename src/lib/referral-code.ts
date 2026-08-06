import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

import { batchLetter } from "@/lib/referral-code-shape";

/**
 * Issuing a code. The shape of one lives in referral-code-shape, which is a
 * plain module because the admin UI needs to read a code without dragging a
 * server-only import into a client component.
 */

const PREFIX = "DM";

/**
 * The next free code for a batch.
 *
 * Reads the highest serial already issued for that batch and adds one. Two
 * admins adding people at the same moment could compute the same serial; the
 * unique constraint on `profiles.referral_code` is what actually guarantees
 * uniqueness, and the caller retries. This just makes a collision unlikely
 * rather than relying on luck.
 */
export async function nextReferralCode(
  db: SupabaseClient<Database>,
  batch: string | null | undefined,
  attempt = 0,
): Promise<string> {
  const prefix = `${PREFIX}${batchLetter(batch)}`;

  const { data } = await db
    .from("profiles")
    .select("referral_code")
    .like("referral_code", `${prefix}%`);

  let highest = 0;
  for (const row of data ?? []) {
    // Only the trailing digits — a legacy code that happens to start DMA
    // must not be read as a serial.
    const tail = row.referral_code.slice(prefix.length);
    if (!/^\d+$/.test(tail)) continue;
    highest = Math.max(highest, Number(tail));
  }

  const serial = highest + 1 + attempt;
  return `${prefix}${String(serial).padStart(2, "0")}`;
}
