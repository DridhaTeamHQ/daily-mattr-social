"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  ClipboardList,
  Gift,
  House,
  LogOut,
  Trophy,
} from "lucide-react";

import { signOut } from "@/app/login/actions";
import { cn, initials } from "@/lib/utils";

/**
 * Ambassadors are on phones almost exclusively, so navigation is a thumb-reach
 * bottom bar on small screens and a conventional top bar from `sm` up.
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
  },
  {
    href: "/dashboard/campaigns",
    label: "Campaigns",
    icon: Clapperboard,
    active: "bg-reel-tint text-reel",
    dot: "text-reel",
  },
  {
    href: "/dashboard/surveys",
    label: "Surveys",
    icon: ClipboardList,
    active: "bg-poll-tint text-poll",
    dot: "text-poll",
  },
  {
    href: "/dashboard/referrals",
    label: "Referrals",
    icon: Gift,
    active: "bg-invite-tint text-invite",
    dot: "text-invite",
  },
  {
    href: "/dashboard/leaderboard",
    label: "Ranks",
    icon: Trophy,
    active: "bg-rank-tint text-rank",
    dot: "text-rank",
  },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav({ name }: { name: string }) {
  const isActive = useIsActive();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-5 px-4 sm:px-6">
        <Link href="/dashboard" className="shrink-0">
          <span className="text-brand-gradient text-[16px] font-semibold tracking-tight">
            DailyMattr
          </span>
        </Link>

        <nav className="hidden flex-1 items-center gap-0.5 sm:flex">
          {ITEMS.map(({ href, label, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "rounded-sm px-3 py-1.5 text-[13.5px] font-medium transition-colors",
                isActive(href)
                  ? active
                  : "text-ink-soft hover:bg-canvas-sunk hover:text-ink",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <span
            aria-hidden
            className="bg-brand-gradient grid size-8 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold text-white"
          >
            {initials(name)}
          </span>
          <span className="hidden max-w-[10rem] truncate text-[13px] text-ink-soft sm:block">
            {name}
          </span>

          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              className="grid size-8 place-items-center rounded-sm text-ink-faint transition-colors hover:bg-canvas-sunk hover:text-ink"
            >
              <LogOut className="size-4" />
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
        {ITEMS.map(({ href, label, icon: Icon, dot }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? dot : "text-ink-faint",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-current"
                  />
                )}
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
