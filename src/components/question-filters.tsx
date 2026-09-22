"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { ANSWERED, SKIPPED } from "@/lib/survey-filters";
import { cn, formatNumber } from "@/lib/utils";

/**
 * One filter per question, over the responses list.
 *
 * Folded away by default. Eight questions is eight dropdowns, which above a
 * table is a wall you scroll past to reach the thing you came for — and the
 * common visit uses none of them. It opens itself when a filter is already on,
 * so a link somebody shared arrives showing why it shows what it shows.
 *
 * Native selects, one navigation per change, and the choice lives in the URL:
 * the same reasoning as the search box beside it — a narrowed view can be
 * linked, reloaded and shared, and the back button undoes a filter.
 *
 * Every option carries the number of responses choosing it would leave, and
 * those numbers already respect the other filters. A dropdown offering eleven
 * choices where ten of them lead to an empty table is worse than no dropdown.
 */

export type QuestionFilter = {
  /** The querystring key — `f1` for the first question. */
  param: string;
  /** "Q1", matching the column heading and the summary card. */
  label: string;
  prompt: string;
  /** What the URL currently asks for, or null for no filter on this one. */
  value: string | null;
  /** Distinct answers with how many rows each would leave. */
  options: { value: string; count: number }[];
  /** False when there were too many distinct answers to be worth listing. */
  listed: boolean;
  answered: number;
  skipped: number;
};

/** What a chosen value is called once it is chosen. */
function labelFor(filter: QuestionFilter): string | null {
  if (filter.value === null) return null;
  if (filter.value === ANSWERED) return "Answered";
  if (filter.value === SKIPPED) return "Skipped";
  return filter.value;
}

export function QuestionFilters({ filters }: { filters: QuestionFilter[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const active = filters.filter((f) => f.value !== null);

  // Initial state only: opening on arrival is about the link that was shared,
  // not about every later change. Clearing the last filter must not collapse
  // the panel while somebody is still using it.
  const [open, setOpen] = React.useState(active.length > 0);

  const go = (next: URLSearchParams) => {
    // Page 3 of an old filter is not page 3 of a new one, and the clamp would
    // quietly land you on the last page rather than the first.
    next.delete("page");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const choose = (param: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    go(next);
  };

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    for (const filter of filters) next.delete(filter.param);
    go(next);
  };

  if (filters.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 text-[13px] font-extrabold text-ink"
        >
          <SlidersHorizontal aria-hidden className="size-4 text-ink-soft" />
          Filter by answer
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 text-ink-soft transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {active.length > 0 && (
          <>
            <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
              {active.length} on
            </span>

            <button
              type="button"
              onClick={clearAll}
              className="ml-auto text-[12.5px] font-bold text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              Clear filters
            </button>
          </>
        )}
      </div>

      {/* The active filters stay readable with the panel shut, so a narrowed
          table never looks like a table that lost its rows. */}
      {!open && active.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-gray-100 px-3 py-2.5">
          {active.map((filter) => (
            <button
              key={filter.param}
              type="button"
              onClick={() => choose(filter.param, "")}
              title={`${filter.prompt} — click to clear`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand bg-brand-tint px-2.5 py-1 text-[12px] font-bold text-ink"
            >
              <span className="shrink-0 text-ink-soft">{filter.label}</span>
              <span className="truncate">{labelFor(filter)}</span>
              <span aria-hidden className="shrink-0 text-ink-soft">
                ×
              </span>
              <span className="sr-only">Clear this filter</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="grid gap-3 border-t border-gray-100 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {filters.map((filter) => (
            <label key={filter.param} className="block min-w-0">
              <span className="block truncate text-[11.5px] font-bold text-ink-faint">
                <span className="text-ink-soft">{filter.label}</span>{" "}
                <span title={filter.prompt}>{filter.prompt}</span>
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
                  <option value="">Any answer</option>

                  {filter.listed &&
                    filter.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value} ({formatNumber(option.count)})
                      </option>
                    ))}

                  <option value={ANSWERED}>
                    Answered ({formatNumber(filter.answered)})
                  </option>
                  <option value={SKIPPED}>
                    Skipped ({formatNumber(filter.skipped)})
                  </option>

                  {/* A value from a shared link that nothing matches any more
                      still has to read as the chosen one, or the select would
                      say "Any answer" while the table stays filtered. */}
                  {filter.value &&
                    filter.value !== ANSWERED &&
                    filter.value !== SKIPPED &&
                    !filter.options.some((o) => o.value === filter.value) && (
                      <option value={filter.value}>{filter.value} (0)</option>
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
      )}
    </div>
  );
}
