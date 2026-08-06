import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Click counting that gets cheaper the more popular a link is.
 *
 * One write per visit is fine at ten visits a minute and silly at a thousand:
 * the link that works hardest generates the most write traffic, so success is
 * what tips the counter over. This coalesces instead. Visits land in a map,
 * one write is in flight at a time per link, and everything that arrives while
 * that write is out goes into the next one as a single `+ n`.
 *
 * A burst of 500 becomes a handful of round trips rather than 500.
 *
 * The trade: the map lives in one server instance's memory, so a crash between
 * a visit and its flush loses that visit. Clicks are best-effort by design —
 * the funnel needs the shape, not a receipt — and the window is milliseconds
 * wide, not minutes.
 */

const pending = new Map<string, number>();
const inFlight = new Set<string>();

export function countSurveyClick(linkId: string): Promise<void> {
  pending.set(linkId, (pending.get(linkId) ?? 0) + 1);
  return flush(linkId);
}

async function flush(linkId: string): Promise<void> {
  // Somebody else is already writing for this link; their next pass picks up
  // what we just added.
  if (inFlight.has(linkId)) return;

  inFlight.add(linkId);
  try {
    // Loop rather than write once: visits that arrive during the round trip
    // are in the map by the time it returns.
    for (;;) {
      const amount = pending.get(linkId) ?? 0;
      if (amount === 0) return;
      pending.delete(linkId);

      const { error } = await createAdminClient().rpc("bump_survey_click", {
        link_id: linkId,
        amount,
      });

      if (error) {
        // Put them back. The next visit tries again; a database that is down
        // must not turn into a page that is down.
        pending.set(linkId, (pending.get(linkId) ?? 0) + amount);
        return;
      }
    }
  } finally {
    inFlight.delete(linkId);
  }
}
