"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A dropdown that navigates.
 *
 * A native `<select>` rather than a custom popover, deliberately: it is one
 * tab stop, it opens as the platform picker on a phone instead of a list that
 * has to be scrolled inside the page, and it needs no open/close state to get
 * wrong. The chevron is drawn on top because the native arrow is unstyleable
 * and looks foreign next to everything else here.
 *
 * Navigation happens on change, so the URL stays the source of truth and the
 * view can be linked and reloaded.
 */
export type NavOption = { value: string; label: string };

export function NavSelect({
  label,
  value,
  options,
  className,
}: {
  label: string;
  value: string;
  options: NavOption[];
  className?: string;
}) {
  const router = useRouter();

  return (
    <label className={cn("inline-flex items-center gap-2", className)}>
      <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
        {label}
      </span>

      <span className="relative inline-block">
        <select
          value={value}
          onChange={(event) => router.push(event.target.value)}
          className={cn(
            "h-10 appearance-none rounded-lg border border-gray-200 bg-white",
            "py-0 pr-9 pl-3 text-[13.5px] font-bold text-ink",
            "focus:border-brand focus:outline-none",
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-faint"
        />
      </span>
    </label>
  );
}
