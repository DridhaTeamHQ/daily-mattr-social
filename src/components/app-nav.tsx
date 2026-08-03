"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  ClipboardList,
  Gift,
  House,
  Trophy,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Ambassadors are on phones almost exclusively, so navigation is a thumb-reach
 * bottom bar on small screens and a conventional top bar from `sm` up.
 */

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Clapperboard },
  { href: "/dashboard/surveys", label: "Surveys", icon: ClipboardList },
  { href: "/dashboard/referrals", label: "Referrals", icon: Gift },
  { href: "/dashboard/leaderboard", label: "Ranks", icon: Trophy },
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
    <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="text-[15px] font-semibold tracking-tight text-ink"
        >
          DailyMattr
        </Link>

        <nav className="hidden flex-1 items-center gap-1 sm:flex">
          {ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "rounded-sm px-3 py-1.5 text-[13.5px] font-medium transition-colors",
                isActive(href)
                  ? "bg-brand-tint text-brand-press"
                  : "text-ink-soft hover:bg-canvas-sunk hover:text-ink",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <span className="ml-auto truncate text-[13px] text-ink-soft sm:ml-0">
          {name}
        </span>
      </div>
    </header>
  );
}

export function BottomNav() {
  const isActive = useIsActive();

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur sm:hidden",
        // Clear the iOS home indicator.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="flex">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-brand" : "text-ink-faint",
                )}
              >
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
