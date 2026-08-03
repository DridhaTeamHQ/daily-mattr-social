"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  ClipboardList,
  Flame,
  Gift,
  House,
  LogOut,
  Trophy,
} from "lucide-react";

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
 * Each destination carries its own accent, matching the colour that section
 * uses throughout. The nav is where students learn the mapping.
 */

const ITEMS = [
  {
    href: "/dashboard",
    label: "Home",
    icon: House,
    active: "bg-brand-tint text-brand-press",
    dot: "text-brand",
    pill: "bg-brand",
  },
  {
    href: "/dashboard/campaigns",
    label: "Campaigns",
    icon: Clapperboard,
    active: "bg-reel-tint text-reel",
    dot: "text-reel",
    pill: "bg-reel",
  },
  {
    href: "/dashboard/surveys",
    label: "Surveys",
    icon: ClipboardList,
    active: "bg-poll-tint text-poll",
    dot: "text-poll",
    pill: "bg-poll",
  },
  {
    href: "/dashboard/referrals",
    label: "Referrals",
    icon: Gift,
    active: "bg-invite-tint text-invite",
    dot: "text-invite",
    pill: "bg-invite",
  },
  {
    href: "/dashboard/leaderboard",
    label: "Ranks",
    icon: Trophy,
    active: "bg-rank-tint text-rank",
    dot: "text-rank",
    pill: "bg-rank",
  },
];

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
      className="inline-flex items-center gap-1 rounded-full bg-flame-tint px-2.5 py-1 text-[13px] font-bold text-flame"
    >
      <Flame className={cn("size-4", days >= 3 && "animate-throb")} />
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
    <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="shrink-0">
          <span className="text-brand-gradient text-[19px] font-extrabold tracking-tight">
            DailyMattr
          </span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 sm:flex">
          {ITEMS.map(({ href, label, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "rounded-sm px-3.5 py-2 text-[14px] font-semibold transition-colors",
                isActive(href)
                  ? active
                  : "text-ink-soft hover:bg-canvas-sunk hover:text-ink",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <StreakChip days={streak} />

          <NotificationBell
            items={notifications}
            vapidPublicKey={vapidPublicKey}
          />

          <span
            aria-hidden
            title={name}
            className="bg-brand-gradient grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
          >
            {initials(name)}
          </span>

          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              className="grid size-10 place-items-center rounded-sm text-ink-faint transition-colors hover:bg-canvas-sunk hover:text-ink"
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
        "fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-md sm:hidden",
        // Clear the iOS home indicator.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="flex">
        {ITEMS.map(({ href, label, icon: Icon, dot, pill }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors",
                  active ? dot : "text-ink-faint",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-0 h-1 rounded-b-full transition-all duration-200",
                    active ? cn("w-10", pill) : "w-0",
                  )}
                />
                <Icon className={cn("size-5.5", active && "animate-pop")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
