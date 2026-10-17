import "server-only";

import type { Zone } from "@/components/zone-pill";
import { createClient } from "@/lib/supabase/server";

/**
 * Every hand-set zone, keyed by ambassador id.
 *
 * Read through the plain server client rather than the cached admin one: the
 * table is a dozen rows, and a zone an admin has just set should show on the
 * next load, not after the cache rolls over. RLS (0055) limits it to admins.
 */
export async function getZones(): Promise<Map<string, Zone>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ambassador_zones")
    .select("ambassador_id, zone");

  // The check constraint allows only red and orange; anything else would be a
  // row this code does not know how to draw, so it reads as no zone at all.
  return new Map(
    (data ?? [])
      .filter((row) => row.zone === "red" || row.zone === "orange")
      .map((row) => [row.ambassador_id, row.zone as Zone]),
  );
}
