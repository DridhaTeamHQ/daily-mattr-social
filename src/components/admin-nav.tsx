"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Clapperboard,
  Coins,
  Gift,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Trophy,
  Users,
} from "lucide-react";

import { Wordmark } from "@/components/logo";
import { VersionSwitcher } from "@/components/version-switcher";
import { signOut } from "@/app/login/actions";
import type { ProgrammeVersion } from "@/lib/programme-version";
import { cn, initials } from "@/lib/utils";

/**
 * Admin navigation. Deliberately darker than the ambassador app — admins
 * switch between the two, and the shell should make it obvious which one
 * they're looking at before they read a single label.
 */

/**
 * The nav in the order the work happens.
 *
 * Campaigns owns the task library and now the review queue too — reviewing a
 * screenshot is the second half of running a campaign, not a separate errand,
 * and it was the one destination admins reached from a badge rather than from
 * a decision. Ambassadors owns referrals, stipend and the leaderboard.
 *
 * Analytics sits last on purpose. It is the thing you open when the day's work
 * is done, and giving it second position put a reading screen ahead of every
 * screen you act on.
 */
const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/campaigns", label: "Tasks", icon: Clapperboard },
  { href: "/admin/surveys", label: "Surveys", icon: ClipboardList },
  { href: "/admin/ambassadors", label: "Ambassadors", icon: Users },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

/**
 * Everything with a page but no room in the bar.
 *
 * All three belong to Ambassadors and are reachable from inside it. Reachable
 * was doing a lot of work, though: Installs is two clicks and a dropdown away,
 * behind a section switcher labelled "View", and the top bar went completely
 * dark once you arrived, because no item here matched the path. A page you
 * cannot get to in one move and cannot see yourself standing on is, in
 * practice, a page nobody opens.
 *
 * The task library is deliberately not here. It is already a tab on the
 * Campaigns section, in plain sight the moment you open Tasks, and listing it
 * again would put the same destination in two places on one bar.
 *
 * So they get a door of their own rather than a sixth tab. A sixth tab is the
 * change that looks free and is not: the bar also carries the run switcher,
 * the ambassador-view link and the account controls, and this is where it
 * starts wrapping on a laptop. The overflow is honest about the ranking —
 * these are the less-travelled destinations — while still costing one click,
 * and it lights up when you are on one of them.
 *
 * Labels are the words on the pages themselves. `/admin/referrals` renders a
 * page headed "Installs", and a bar that called it Referrals would be sending
 * people somewhere whose name they never see.
 */
const MORE_ITEMS = [
  { href: "/admin/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/admin/referrals", label: "Installs", icon: Gift },
  { href: "/admin/stipend", label: "Stipend & payouts", icon: Coins },
];

export function AdminNav({
  name,
  queueCount,
  versions,
  viewingVersion,
}: {
  name: string;
  queueCount: number;
  /** Every run of the programme. The switcher hides itself when there is one. */
  versions: ProgrammeVersion[];
  viewingVersion: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    // Review and the task library are pages inside Campaigns, so Campaigns
    // stays lit while you are on either. Without this the whole bar goes dark
    // there — which is exactly what the library did, being a tab of a section
    // whose name the bar never matched.
    if (
      href === "/admin/campaigns" &&
      (pathname.startsWith("/admin/review") ||
        pathname.startsWith("/admin/library"))
    ) {
      return true;
    }
    return pathname.startsWith(href);
  };

  // Lights the overflow trigger while you are on one of its pages, so the bar
  // is never entirely dark. It used to be, on all four of them.
  const inMore = MORE_ITEMS.some(({ href }) => pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-20 border-b border-ink/10 bg-ink text-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4 sm:px-6">
        <Link
          href="/admin"
          aria-label="dailymattr admin — overview"
          className="flex shrink-0 items-center gap-1.5"
        >
          <Wordmark className="h-[22px] w-auto text-white" />
          <span className="rounded-xs bg-white/15 px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide uppercase">
            Admin
          </span>
        </Link>

        <nav className="hidden flex-1 items-center gap-0.5 md:flex">
          {ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13.5px] font-medium transition-colors",
                isActive(href)
                  ? "bg-white/15 text-white"
                  : "text-white/65 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="size-4" />
              {label}
              {/* The queue count rides on Campaigns now that Review lives
                  inside it — an admin still learns from the top bar that
                  something is waiting, without a destination of its own. */}
              {href === "/admin/campaigns" && queueCount > 0 && (
                <span className="ml-0.5 rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white">
                  {queueCount}
                </span>
              )}
            </Link>
          ))}

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label="More admin sections"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13.5px] font-medium transition-colors data-[state=open]:bg-white/15 data-[state=open]:text-white",
                  inMore
                    ? "bg-white/15 text-white"
                    : "text-white/65 hover:bg-white/10 hover:text-white",
                )}
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">More</span>
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={8}
                className="animate-rise z-50 w-56 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-pop"
              >
                {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
                  <DropdownMenu.Item key={href} asChild>
                    <Link
                      href={href}
                      aria-current={
                        pathname.startsWith(href) ? "page" : undefined
                      }
                      className={cn(
                        "flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] font-semibold outline-none transition-colors hover:bg-canvas-sunk focus:bg-canvas-sunk",
                        pathname.startsWith(href)
                          ? "text-brand"
                          : "text-ink",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {label}
                    </Link>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {/* Left of everything else in this group, because it governs what
              every number on the page underneath means. */}
          <VersionSwitcher versions={versions} viewing={viewingVersion} />

          <Link
            href="/dashboard"
            className="hidden rounded-sm px-2.5 py-1.5 text-[13px] text-white/65 transition-colors hover:bg-white/10 hover:text-white sm:block"
          >
            Ambassador view
          </Link>

          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-full bg-white/15 text-[11.5px] font-semibold"
          >
            {initials(name)}
          </span>

          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              className="grid size-8 place-items-center rounded-sm text-white/65 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </div>

      {/* Phones get a scrollable strip rather than a bottom bar: admin work is
          a desk activity, and the ambassador app already owns the bottom.

          The overflow items are laid out here rather than behind the same
          dropdown. The strip already scrolls, so they cost nothing but a
          swipe, and a menu that opens out of a horizontally scrolling
          container is the one interaction on this bar that would need
          explaining. */}
      <nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 pb-2 md:hidden">
        {[...ITEMS, ...MORE_ITEMS].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13px] font-medium",
              isActive(href) ? "bg-white/15 text-white" : "text-white/65",
            )}
          >
            <Icon className="size-4" />
            {label}
            {href === "/admin/campaigns" && queueCount > 0 && (
              <span className="rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white">
                {queueCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </header>
  );
}
