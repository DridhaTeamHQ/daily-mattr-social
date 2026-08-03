import "server-only";

import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Enums } from "@/lib/database.types";

/**
 * Notification delivery.
 *
 * Two channels, one call. `notify()` always writes the in-app row — that is the
 * durable record and the thing the bell reads — and then tries Web Push as a
 * best effort on top.
 *
 * Push is deliberately non-fatal. A student who denied permission, cleared
 * their browser data, or is on a browser without push support must not cause an
 * approval to fail. Every push error is swallowed after cleaning up dead
 * subscriptions.
 */

let configured: boolean | null = null;

function pushConfigured(): boolean {
  if (configured !== null) return configured;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    configured = false;
    return configured;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return configured;
}

export type NotifyInput = {
  profileId: string;
  type: Enums<"notification_type">;
  title: string;
  body?: string;
  /** Relative path. The database rejects anything else. */
  href?: string;
  meta?: Record<string, unknown>;
};

export async function notify(input: NotifyInput): Promise<void> {
  const db = createAdminClient();

  const { error } = await db.from("notifications").insert({
    profile_id: input.profileId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    meta: (input.meta ?? {}) as never,
  });

  // The in-app row is the one that matters; if it fails, say so.
  if (error) throw error;

  await sendPush(input).catch(() => {
    // Already handled internally. Nothing here should surface to the caller.
  });
}

/** Fan out to every browser this person has registered. */
async function sendPush(input: NotifyInput): Promise<void> {
  if (!pushConfigured()) return;

  const db = createAdminClient();
  const { data: subscriptions } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", input.profileId);

  if (!subscriptions?.length) return;

  const payload = JSON.stringify({
    title: input.title,
    body: input.body ?? "",
    href: input.href ?? "/dashboard",
    type: input.type,
  });

  const dead: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
      } catch (err) {
        // 404 / 410 mean the browser threw the subscription away — the row is
        // rubbish now and will never work again, so drop it rather than
        // retrying forever on every future notification.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.id);
      }
    }),
  );

  if (dead.length) {
    await db.from("push_subscriptions").delete().in("id", dead);
  }
}

/** Send the same notification to many people, e.g. a campaign going live. */
export async function notifyMany(
  profileIds: string[],
  input: Omit<NotifyInput, "profileId">,
): Promise<void> {
  await Promise.all(
    profileIds.map((profileId) =>
      notify({ ...input, profileId }).catch(() => {
        // One student's dead subscription must not stop the rest of the cohort
        // being told a campaign went live.
      }),
    ),
  );
}

/** Every active ambassador — the audience for campaign and survey launches. */
export async function activeAmbassadorIds(): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("role", "ambassador")
    .eq("status", "active");

  return (data ?? []).map((r) => r.id);
}
