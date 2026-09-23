"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A list row that opens to show what is behind its numbers.
 *
 * The summary and the detail are both rendered on the server and handed in
 * as nodes; this only holds whether it is open. Closed rows keep their detail
 * out of the DOM, so a list of sixty ambassadors is still sixty lines.
 */
export function ExpandableRow({
  summary,
  label,
  children,
  className,
}: {
  summary: React.ReactNode;
  /** What the button says while closed, e.g. "15 responses". */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <li className={cn("py-2.5", className)}>
      <div className="flex flex-wrap items-center gap-3">
        {summary}

        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors",
            open
              ? "border-brand bg-brand-tint text-brand-strong"
              : "border-gray-200 bg-surface text-ink hover:bg-gray-50",
          )}
        >
          {open ? "Hide" : label}
          <ChevronDown
            aria-hidden
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      {open && <div className="mt-3">{children}</div>}
    </li>
  );
}
