"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * One card for everybody on the campaign, split by outcome.
 *
 * "Who took part" and "Hasn't started" used to sit side by side: a long list
 * of rows next to a cloud of forty-odd name pills, so the page ran on for
 * screens and neither half lined up with the other. Tabs keep one list on
 * screen at a time, and the counts on the tabs are the summary.
 *
 * The panels are rendered on the server and handed in; this only remembers
 * which one is open.
 */
export function PeopleTabs({
  tabs,
  initial,
}: {
  tabs: {
    key: string;
    label: string;
    count: number;
    /** Dot colour on the tab, so it matches the badges in the list. */
    color: string;
    content: React.ReactNode;
  }[];
  initial?: string;
}) {
  const [open, setOpen] = React.useState(initial ?? tabs[0]?.key);
  const current = tabs.find((tab) => tab.key === open) ?? tabs[0];

  return (
    <>
      <div
        role="tablist"
        aria-label="Ambassadors by outcome"
        className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-200 px-1"
      >
        {tabs.map((tab) => {
          const active = tab.key === current?.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setOpen(tab.key)}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-bold transition-colors",
                active
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-soft hover:text-ink",
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: tab.color }}
              />
              {tab.label}
              <span
                className={cn(
                  "tabular rounded-full px-1.5 py-px text-[11px] font-extrabold",
                  active ? "bg-ink text-white" : "bg-gray-100 text-ink-soft",
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="pt-2">
        {current?.content}
      </div>
    </>
  );
}
