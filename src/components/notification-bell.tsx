"use client";

import * as Popover from "@radix-ui/react-popover";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  Bell,
  BellRing,
  CheckCheck,
  Clapperboard,
  ClipboardList,
  Gift,
  TrendingUp,
  CircleAlert,
  CircleCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notification-actions";
import { savePushSubscription } from "@/lib/push-actions";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

const ICONS: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  submission_approved: { icon: CircleCheck, tint: "bg-ok-tint text-ok" },
  submission_rejected: { icon: CircleAlert, tint: "bg-bad-tint text-bad" },
  submission_revoked: { icon: CircleAlert, tint: "bg-bad-tint text-bad" },
  points_awarded: { icon: TrendingUp, tint: "bg-brand-tint text-brand" },
  campaign_live: { icon: Clapperboard, tint: "bg-reel-tint text-reel" },
  survey_live: { icon: ClipboardList, tint: "bg-poll-tint text-poll" },
  rank_up: { icon: TrendingUp, tint: "bg-rank-tint text-rank" },
  referral_confirmed: { icon: Gift, tint: "bg-invite-tint text-invite" },
  account: { icon: Bell, tint: "bg-canvas-sunk text-ink-soft" },
};

function notificationCopy(value: string) {
  return value
    .replace(/\+?\d+\s+points?\b/gi, "task completion")
    .replace(/\bpoints?\b/gi, "completion");
}

/** "3m", "2h", "5d" — compact enough for a crowded row. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * VAPID keys travel as base64url but `applicationServerKey` wants raw bytes.
 *
 * Returns the ArrayBuffer rather than a Uint8Array view: TypeScript's DOM lib
 * requires `ArrayBufferView<ArrayBuffer>` specifically, and a plain
 * `Uint8Array` is inferred as the wider `ArrayBufferLike`.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);

  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

type PushState = "unsupported" | "default" | "granted" | "denied" | "working";

/** Permission only changes on a user gesture, so there is nothing to watch. */
function subscribeToNothing() {
  return () => {};
}

function detectPushState(vapidPublicKey: string | null): PushState {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !vapidPublicKey
  ) {
    return "unsupported";
  }
  return Notification.permission as "default" | "granted" | "denied";
}

export function NotificationBell({
  items,
  vapidPublicKey,
}: {
  items: NotificationItem[];
  vapidPublicKey: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  /**
   * Browser push capability is external state that never changes on its own —
   * only a user gesture moves it. `useSyncExternalStore` reads it without an
   * effect, which keeps the server render ("unsupported", so the opt-in is
   * hidden) consistent with the first client render.
   */
  const detected = React.useSyncExternalStore(
    subscribeToNothing,
    () => detectPushState(vapidPublicKey),
    () => "unsupported" as const,
  );

  // Set by the opt-in handler so the panel updates without a round trip.
  const [override, setOverride] = React.useState<PushState | null>(null);
  const pushState = override ?? detected;
  const setPushState = setOverride;

  const unread = items.filter((n) => !n.read_at).length;

  async function enablePush() {
    if (!vapidPublicKey) return;
    setPushState("working");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission as "denied" | "default");
        toast.error("Notifications blocked. You can turn them on in browser settings.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Reuse an existing subscription if the browser already has one —
      // subscribing twice on one device delivers everything twice.
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(vapidPublicKey),
        }));

      const json = subscription.toJSON();
      const result = await savePushSubscription({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
        userAgent: navigator.userAgent,
      });

      if (result.ok) {
        setPushState("granted");
        toast.success(result.message);
      } else {
        setPushState("default");
        toast.error(result.message);
      }
    } catch {
      setPushState("default");
      toast.error("Couldn't turn on notifications on this browser.");
    }
  }

  async function openItem(item: NotificationItem) {
    if (!item.read_at) await markNotificationRead(item.id);
    setOpen(false);
    if (item.href) router.push(item.href);
    else router.refresh();
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
          className="relative grid size-10 place-items-center rounded-full text-white transition-colors hover:bg-white/10 hover:text-white"
        >
          {unread > 0 ? (
            <BellRing className="size-5" />
          ) : (
            <Bell className="size-5" />
          )}

          {unread > 0 && (
            <span className="animate-throb absolute top-1 right-1 grid min-w-4.5 place-items-center rounded-full bg-reel px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="animate-rise z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-line bg-surface shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[14px] font-semibold text-ink">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await markAllNotificationsRead();
                  router.refresh();
                }}
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:text-brand-hover"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Push opt-in. Only shown when it can actually work and hasn't
              already been granted — a permanently visible "enable" button that
              does nothing is worse than none. */}
          {pushState !== "unsupported" && pushState !== "granted" && (
            <button
              type="button"
              onClick={enablePush}
              disabled={pushState === "working" || pushState === "denied"}
              className="flex w-full items-start gap-2.5 border-b border-line bg-brand-tint px-4 py-3 text-left transition-colors hover:bg-brand-line/40 disabled:opacity-60"
            >
              <BellRing className="mt-0.5 size-4 shrink-0 text-brand" />
              <span>
                <span className="block text-[13px] font-semibold text-brand-press">
                  {pushState === "denied"
                    ? "Notifications are blocked"
                    : "Get notified on your phone"}
                </span>
                <span className="mt-0.5 block text-[12px] text-brand-press/75">
                  {pushState === "denied"
                    ? "Re-enable them in your browser settings for this site."
                    : "Know the moment a screenshot is approved."}
                </span>
              </span>
            </button>
          )}

          <ul className="max-h-[24rem] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-10 text-center">
                <p className="text-[13.5px] font-medium text-ink">
                  Nothing yet
                </p>
                <p className="mt-1 text-[12.5px] text-ink-soft">
                  Approvals, new campaigns and rank changes land here.
                </p>
              </li>
            ) : (
              items.map((item) => {
                const meta = ICONS[item.type] ?? ICONS.account;
                const Icon = meta.icon;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-canvas-sunk",
                        !item.read_at && "bg-brand-tint/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-xs",
                          meta.tint,
                        )}
                      >
                        <Icon className="size-4" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                            {notificationCopy(item.title)}
                          </span>
                          <span className="shrink-0 text-[11.5px] text-ink-faint">
                            {ago(item.created_at)}
                          </span>
                        </span>
                        {item.body && (
                          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-soft">
                            {notificationCopy(item.body)}
                          </span>
                        )}
                      </span>

                      {!item.read_at && (
                        <span
                          aria-hidden
                          className="mt-2 size-2 shrink-0 rounded-full bg-brand"
                        />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
