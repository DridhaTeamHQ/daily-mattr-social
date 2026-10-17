import "server-only";

import { createClient } from "@/lib/supabase/server";

export type WelcomeMail = {
  status: "sent" | "failed";
  /** When one was last accepted, if ever. */
  sentAt: string | null;
};

/**
 * Who has been sent their welcome email from the console, keyed by id.
 *
 * Plain server client, not the cached one, for the same reason as zones: the
 * tag should change on the next load after Send mail, not when a cache rolls
 * over. RLS (0056) limits it to admins.
 */
export async function getWelcomeMails(): Promise<Map<string, WelcomeMail>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ambassador_welcome_emails")
    .select("ambassador_id, last_status, sent_at");

  return new Map(
    (data ?? []).map((row) => [
      row.ambassador_id,
      {
        status: row.last_status === "sent" ? "sent" : "failed",
        sentAt: row.sent_at,
      },
    ]),
  );
}
