"use server";

import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/view-as";

/**
 * Push subscription registration.
 *
 * The rows are written through the caller's own RLS session — the
 * `push_subscriptions_own` policy already scopes everything to
 * `profile_id = auth.uid()`, so there is no reason to reach for the
 * service-role client here.
 */

export type PushResult = { ok: boolean; message: string };

/**
 * The push endpoint is a URL the server will later make requests to.
 *
 * It arrives from the browser, and it was stored and used exactly as given.
 * That makes it a server-side request forgery primitive: a signed-in user
 * could register `http://169.254.169.254/…` or an address on the deployment's
 * own network and have the notification sender fetch it on their behalf,
 * carrying whatever the platform attaches to outbound requests.
 *
 * Real subscriptions only ever come from a handful of vendor hosts, so an
 * allowlist costs nothing and closes the whole class. `https` is required
 * separately because an allowlisted host over plain http is still a downgrade.
 */
const PUSH_HOSTS = [
  "android.googleapis.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "updates-autopush.stage.mozaws.net",
  "notify.windows.com",
  "push.apple.com",
];

function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

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

  // The bell is showing a student's notifications during a preview, but this
  // would register the *admin's* browser for push. Declining keeps the
  // preview from quietly signing anyone up for anything.
  if ((await getViewer())?.isPreview) {
    return {
      ok: false,
      message: "Stop the ambassador preview before changing notifications.",
    };
  }

  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    return { ok: false, message: "That push endpoint isn't one we recognise." };
  }

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
