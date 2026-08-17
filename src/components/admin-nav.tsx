"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Clapperboard,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";

import { Wordmark } from "@/components/logo";
import { signOut } from "@/app/login/actions";
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
  { href: "/admin/campaigns", label: "Campaigns", icon: Clapperboard },
  { href: "/admin/surveys", label: "Surveys", icon: ClipboardList },
  { href: "/admin/ambassadors", label: "Ambassadors", icon: Users },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export function AdminNav({
  name,
  queueCount,
}: {
  name: string;
  queueCount: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    // Review is a page inside Campaigns, so Campaigns stays lit while you are
    // in the queue. Without this the whole bar goes dark there.
    if (href === "/admin/campaigns" && pathname.startsWith("/admin/review")) {
      return true;
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-ink/10 bg-ink text-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4 sm:px-6">
        <Link
          href="/admin"
          aria-label="DailyMattr admin — overview"
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
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
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
          a desk activity, and the ambassador app already owns the bottom. */}
      <nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 pb-2 md:hidden">
        {ITEMS.map(({ href, label, icon: Icon }) => (
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
