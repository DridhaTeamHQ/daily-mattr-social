"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DEFAULT_PERIOD, PERIODS, type PeriodKey } from "@/lib/admin/period";
import { cn } from "@/lib/utils";

/**
 * Day / Week / Month, as a segmented control.
 *
 * Three mutually exclusive choices that are always worth seeing at once, so
 * buttons rather than a dropdown: the current one is legible without opening
 * anything, and switching is one click instead of three.
 *
 * Like the cohort filter, the URL is the state, and the default is left out of
 * it — `?period=month` and no param at all are the same view, and only one of
 * them should exist.
 */
export function PeriodFilter({ period }: { period: PeriodKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (key: PeriodKey) => {
    const next = new URLSearchParams(params.toString());
    if (key === DEFAULT_PERIOD) next.delete("period");
    else next.set("period", key);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div
      role="group"
      aria-label="Time period"
      className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-white p-1"
    >
      {PERIODS.map((option) => {
        const selected = option.key === period;

        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={selected}
            onClick={() => go(option.key)}
            className={cn(
              "h-full rounded-md px-3 text-[13px] font-bold transition-colors",
              selected
                ? "bg-ink text-white"
                : "text-ink-soft hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
