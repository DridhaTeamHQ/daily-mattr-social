import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Recording that a student was here today.
 *
 * The programme expects them on the app most days, and somebody who has
 * stopped opening it is the earliest signal that they are about to stop
 * delivering — earlier than a missed download target, which only shows up at
 * the end of a month.
 *
 * Days rather than sessions: the question is "did they show up", and a student
 * who opens the app nine times on Tuesday has still only shown up once.
 *
 * The write is idempotent in the database — primary key on (ambassador, day),
 * insert on conflict do nothing — so this is safe to call on every dashboard
 * load. The cache below exists to stop it *travelling*: without it, every page
 * view is a round trip to discover a row that is already there.
 */

/** ambassador id → the day already recorded, in this instance's memory. */
const recorded = new Map<string, string>();

/**
 * IST, because the programme runs in India and a day should end at midnight
 * where the students are rather than in UTC, which would split their evening
 * across two dates.
 */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

export async function markActiveToday(userId: string): Promise<void> {
  const day = today();
  if (recorded.get(userId) === day) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("touch_active_day");

  // Only remember it once the database has actually got it. Caching a failed
  // write would lose the whole day for that instance.
  if (!error) {
    recorded.set(userId, day);

    // A map that only grows is a leak on a long-lived server. Nothing here is
    // worth more than a day, so the whole thing goes when it turns over.
    if (recorded.size > 5000) {
      for (const [id, d] of recorded) if (d !== day) recorded.delete(id);
    }
  }
}
