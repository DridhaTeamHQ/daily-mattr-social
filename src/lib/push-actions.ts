"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Push subscription registration.
 *
 * The rows are written through the caller's own RLS session — the
 * `push_subscriptions_own` policy already scopes everything to
 * `profile_id = auth.uid()`, so there is no reason to reach for the
 * service-role client here.
 */

export type PushResult = { ok: boolean; message: string };

export async function savePushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}): Promise<PushResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in" };

  // The endpoint is unique per browser, so re-subscribing on a device that
  // already registered updates its keys instead of creating a duplicate that
  // would deliver every notification twice.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: subscription.userAgent ?? null,
      last_used: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "You'll get notified from now on" };
}

export async function removePushSubscription(
  endpoint: string,
): Promise<PushResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Notifications turned off" };
}
