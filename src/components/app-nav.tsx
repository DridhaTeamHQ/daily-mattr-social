"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeIndianRupee,
  Clapperboard,
  ClipboardList,
  Flame,
  Coins,
  Gift,
  House,
  LogOut,
  Trophy,
  Upload,
} from "lucide-react";

import { Wordmark } from "@/components/logo";
import { signOut } from "@/app/login/actions";
import {
  NotificationBell,
  type NotificationItem,
} from "@/components/notification-bell";
import { cn, initials } from "@/lib/utils";

/**
 * Ambassadors are on phones almost exclusively, so navigation is a thumb-reach
 * bottom bar on small screens and a top bar from `sm` up.
 *
 * Each destination owns a colour, and the active item is a filled black-edged
 * block rather than a tint — at a glance, from a metre away, on a cracked
 * phone screen.
 */

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: House, fill: "bg-brand" },
  {
    href: "/dashboard/campaigns",
    label: "Campaigns",
    icon: Clapperboard,
    fill: "bg-reel",
  },
  {
    href: "/dashboard/submit",
    label: "Submit",
    icon: Upload,
    fill: "bg-reel",
  },
  {
    href: "/dashboard/surveys",
    label: "Surveys",
    icon: ClipboardList,
    fill: "bg-poll",
  },
  {
    href: "/dashboard/referrals",
    label: "Referrals",
    icon: Gift,
    fill: "bg-invite",
  },
  {
    // Off the phone bar for the same reason Stipend is: adding Submit took it
    // back to seven targets. Ranks is the one people check occasionally rather
    // than act on, and it is still one tap from Home and the top bar.
    href: "/dashboard/leaderboard",
    label: "Ranks",
    icon: Trophy,
    fill: "bg-rank",
    desktopOnly: true,
  },
  {
    // Also off the phone bar. Of the two money screens, Rewards is the one
    // students open repeatedly.
    href: "/dashboard/stipend",
    label: "Stipend",
    icon: BadgeIndianRupee,
    fill: "bg-brand",
    desktopOnly: true,
  },
  {
    href: "/dashboard/rewards",
    label: "Rewards",
    icon: Coins,
    fill: "bg-rank",
  },
];

/**
 * Inline acknowledgement that a tap registered.
 *
 * `loading.tsx` covers the destination, but on a slow connection there is
 * still a gap between the tap and the route committing. `useLinkStatus` fills
 * exactly that gap, so the button never looks ignored.
 */
function PendingDot() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden
      className="ml-1.5 inline-block size-2 animate-ping rounded-full bg-ink align-middle"
    />
  );
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);
}

/** The streak flame. Hidden at zero — "0 day streak" is just a rebuke. */
export function StreakChip({ days }: { days: number }) {
  if (days <= 0) return null;

  return (
    <span
      title={`${days}-day streak`}
      className="brut-sm inline-flex items-center gap-1 rounded-full bg-flame-tint px-2.5 py-1 text-[13px] font-extrabold text-ink"
    >
      <Flame
        className={cn("size-4 text-flame", days >= 3 && "animate-throb")}
        fill="currentColor"
      />
      {days}
    </span>
  );
}

export function TopNav({
  name,
  streak,
  notifications,
  vapidPublicKey,
}: {
  name: string;
  streak: number;
  notifications: NotificationItem[];
  vapidPublicKey: string | null;
}) {
  const isActive = useIsActive();

  return (
    <header className="sticky top-0 z-20 bg-ink text-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="shrink-0">
          {/* White on the ink bar, not brand blue: #2563eb on #0a0a0a is a
              3.1:1 contrast, which is under the floor for something this
              small. The blue lives on the nav pills instead. */}
          <Wordmark label="DailyMattr — home" className="h-[18px] w-auto text-white" />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-2 sm:flex">
          {ITEMS.map(({ href, label, fill }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tap rounded-full px-4 py-1.5 text-[13.5px] font-bold transition-colors",
                  active
                    ? cn("text-white", fill)
                    : "text-gray-300 hover:text-white hover:bg-white/10",
                )}
              >
                {label}
                <PendingDot />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <StreakChip days={streak} />

          <NotificationBell
            items={notifications}
            vapidPublicKey={vapidPublicKey}
          />

          <span
            aria-hidden
            title={name}
            className="tap grid size-9 shrink-0 place-items-center rounded-full bg-gray-800 text-[12px] font-bold text-white border border-gray-700"
          >
            {initials(name)}
          </span>

          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              className="tap grid size-9 place-items-center rounded-full text-gray-300 transition-colors hover:text-white hover:bg-white/10"
            >
              <LogOut className="size-4.5" />
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const isActive = useIsActive();

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 bg-ink text-white sm:hidden",
        // Clear the iOS home indicator.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="flex items-stretch">
        {ITEMS.filter((item) => !item.desktopOnly).map(({ href, label, icon: Icon, fill }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="tap flex flex-col items-center gap-1 px-1 py-2"
              >
                <span
                  className={cn(
                    "relative grid size-9 place-items-center rounded-full transition-transform",
                    active
                      ? cn("text-white", fill)
                      : "text-gray-400 hover:text-white hover:bg-white/10",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-5",
                      active ? "text-white" : "text-gray-400",
                    )}
                  />
                  <span className="absolute -top-0.5 -right-0.5">
                    <PendingDot />
                  </span>
                </span>
                <span
                  className={cn(
                    "text-[10.5px] font-extrabold",
                    active ? "text-ink" : "text-ink-faint",
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
