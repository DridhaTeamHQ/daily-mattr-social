"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Sub-navigation for a grouped admin section.
 *
 * The top bar carries six destinations; everything else hangs off one of them.
 * Campaigns owns the task library. The Ambassadors section has six views and
 * uses a dropdown instead (see `ambassador-nav.tsx`) — six tabs wrap on a
 * laptop and are unusable on a phone.
 */
export type SectionTab = { href: string; label: string };

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Section"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-gray-200 pb-px"
    >
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-t-lg px-3.5 py-2.5 text-[13.5px] font-bold transition-colors",
              // The active tab sits on a 2px underline rather than a filled
              // pill: a filled tab this close to the page title competes with
              // it for the eye.
              active
                ? "border-b-2 border-brand text-brand"
                : "border-b-2 border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const CAMPAIGN_TABS: SectionTab[] = [
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/library", label: "Task library" },
];
