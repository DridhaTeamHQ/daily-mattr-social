"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * URL-backed search box.
 *
 * The query lives in the querystring rather than component state, so a filtered
 * view can be linked, bookmarked, reloaded and shared — and the back button
 * does what you'd expect. That matters most for the exact case an admin hits:
 * finding a student, opening their row, then coming back to the same list.
 *
 * Typing is debounced and uses `replace`, so a search doesn't bury the previous
 * page under twenty history entries.
 */
export function SearchBox({
  placeholder = "Search…",
  param = "q",
  className,
}: {
  placeholder?: string;
  param?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = searchParams.get(param) ?? "";
  const [value, setValue] = React.useState(initial);

  // The committed query, so we don't push a navigation for every keystroke.
  const commit = React.useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) params.set(param, next.trim());
      else params.delete(param);

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [param, pathname, router, searchParams],
  );

  function change(next: string) {
    setValue(next);

    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(next), 250);
  }

  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-ink"
      />

      <input
        type="search"
        value={value}
        onChange={(e) => change(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={[
          "h-11 w-full rounded-sm border-[3px] border-ink bg-surface pr-10 pl-11",
          "text-[14.5px] font-medium text-ink",
          "shadow-[3px_3px_0_var(--color-ink)]",
          "transition-[box-shadow,transform] duration-100 ease-out",
          "focus:-translate-x-px focus:-translate-y-px focus:shadow-[5px_5px_0_var(--color-ink)] focus:outline-none",
          // Safari draws its own clear button on type=search; ours is the one
          // that matches everything else here.
          "[&::-webkit-search-cancel-button]:appearance-none",
        ].join(" ")}
      />

      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            window.clearTimeout(timer.current);
            commit("");
          }}
          className="absolute top-1/2 right-2.5 grid size-7 -translate-y-1/2 place-items-center rounded-xs border-2 border-transparent text-ink transition-colors hover:border-ink hover:bg-canvas-sunk"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
