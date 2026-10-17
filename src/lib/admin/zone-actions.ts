"use server";

import { revalidatePath } from "next/cache";

import type { Zone } from "@/components/zone-pill";
import { assertAdminWrite, fail, type ActionResult } from "@/lib/admin/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ZONE_NAME: Record<Zone, string> = {
  red: "red",
  orange: "orange",
  green: "green",
};

/**
 * Put an ambassador in a zone.
 *
 * Red and orange are rows in `ambassador_zones`; green is the absence of one,
 * so choosing green deletes the row rather than storing a third value that
 * would mean the same thing as nothing.
 */
export async function setAmbassadorZone(
  profileId: string,
  zone: Zone,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdminWrite();
    if (!(zone in ZONE_NAME)) {
      return { ok: false, message: "Pick red, orange or green." };
    }

    // Admins can write this table under RLS (0055).
    const supabase = await createClient();
    const { error } =
      zone === "green"
        ? await supabase
            .from("ambassador_zones")
            .delete()
            .eq("ambassador_id", profileId)
        : await supabase.from("ambassador_zones").upsert({
            ambassador_id: profileId,
            zone,
            set_by: actorId,
            set_at: new Date().toISOString(),
          });
    if (error) throw error;

    await createAdminClient()
      .from("audit_log")
      .insert({
        actor_id: actorId,
        action: "ambassador.zone",
        entity_type: "profile",
        entity_id: profileId,
        meta: { zone } as never,
      });

    revalidatePath("/admin/ambassadors");
    revalidatePath(`/admin/ambassadors/${profileId}`);
    revalidatePath("/admin/analytics");
    return { ok: true, message: `Moved to the ${ZONE_NAME[zone]} zone` };
  } catch (err) {
    return fail(err);
  }
}
