"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { cn, formatNumber } from "@/lib/utils";

/**
 * Who brought a response in, and whether it counted — over the full list.
 *
 * These used to be separate views: a "By ambassador" page and the status
 * tiles. Reading one ambassador's duplicates meant leaving the list to find
 * out whose they were, then coming back and searching their name. As two
 * dropdowns on the list itself they combine with each other, the search and
 * the per-question filters, and the rows stay on screen the whole time.
 *
 * Same URL-backed pattern as the question filters: a narrowed list can be
 * linked and reloaded, and the back button undoes a choice.
 */

export type FilterOption = { value: string; label: string; count: number };

export type ResponseFilter = {
  /** The querystring key. */
  param: string;
  label: string;
  /** What "no filter" is called in the dropdown. */
  any: string;
  value: string | null;
  options: FilterOption[];
};

export function ResponseFilters({ filters }: { filters: ResponseFilter[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const choose = (param: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    // A different filter has different pages.
    next.delete("page");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
      {filters.map((filter) => (
        <label key={filter.param} className="block min-w-0">
          <span className="block text-[11.5px] font-bold text-ink-faint">
            {filter.label}
          </span>

          <span className="relative mt-1 block">
            <select
              value={filter.value ?? ""}
              onChange={(event) => choose(filter.param, event.target.value)}
              className={cn(
                "h-10 w-full appearance-none rounded-lg border border-gray-200 bg-white",
                "py-0 pr-9 pl-3 text-[13.5px] font-bold text-ink",
                "focus:border-brand focus:outline-none",
                filter.value && "border-brand",
              )}
            >
              <option value="">{filter.any}</option>

              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({formatNumber(option.count)})
                </option>
              ))}

              {/* A value from a shared link that nothing matches any more
                  still has to read as the chosen one. */}
              {filter.value &&
                !filter.options.some((o) => o.value === filter.value) && (
                  <option value={filter.value}>Unknown (0)</option>
                )}
            </select>

            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-faint"
            />
          </span>
        </label>
      ))}
    </div>
  );
}
