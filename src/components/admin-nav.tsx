"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Clapperboard,
  Gift,
  Inbox,
  LayoutDashboard,
  LogOut,
  TrendingUp,
  Users,
} from "lucide-react";

import { signOut } from "@/app/login/actions";
import { Wordmark } from "@/components/logo";
import { cn, initials } from "@/lib/utils";

/**
 * Admin navigation. Deliberately darker than the ambassador app — admins
 * switch between the two, and the shell should make it obvious which one
 * they're looking at before they read a single label.
 */

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/admin/review", label: "Review", icon: Inbox },
  { href: "/admin/campaigns", label: "Campaigns", icon: Clapperboard },
  { href: "/admin/surveys", label: "Surveys", icon: ClipboardList },
  { href: "/admin/ambassadors", label: "Ambassadors", icon: Users },
  { href: "/admin/referrals", label: "Referrals", icon: Gift },
];

export function AdminNav({
  name,
  queueCount,
}: {
  name: string;
  queueCount: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-20 border-b border-ink/10 bg-ink text-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4 sm:px-6">
        {/* White mark, not blue: brand blue on the near-black bar is 5.4:1,
            which is fine for a heading but thin for letterforms this small.
            The blue is spent on the Admin chip instead, where it does more
            work — it's the one thing that has to say "you are not in the
            ambassador app" from across a desk. */}
        <Link href="/admin" className="flex shrink-0 items-center gap-2">
          <Wordmark label="DailyMattr admin" className="h-4 w-auto text-white" />
          <span className="rounded-xs bg-brand px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-ink uppercase">
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
              {href === "/admin/review" && queueCount > 0 && (
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
            {href === "/admin/review" && queueCount > 0 && (
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
