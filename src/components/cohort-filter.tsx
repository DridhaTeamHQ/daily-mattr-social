"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, X } from "lucide-react";

import type { Cohort, Dimension } from "@/lib/admin/scope";
import { cn, formatNumber } from "@/lib/utils";

/**
 * The city / college / batch filter that scopes a dashboard.
 *
 * The URL is the state: every figure on the page is computed on the server
 * from these params, so a filtered view can be linked, reloaded and shared,
 * and the back button does the obvious thing. Changing one dimension keeps
 * the others — an admin narrowing from a city to one of its colleges is
 * adding a condition, not starting again.
 *
 * Native `<select>`s rather than a popover: one tab stop each, the platform
 * picker on a phone, and no open/close state to get wrong.
 */

const LABELS: Record<Dimension, { title: string; any: string }> = {
  city: { title: "City", any: "All cities" },
  college: { title: "College", any: "All colleges" },
  batch: { title: "Batch", any: "All batches" },
};

const ORDER: Dimension[] = ["city", "college", "batch"];

export function CohortFilter({ cohort }: { cohort: Cohort }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefFor = (changes: Partial<Record<Dimension, string | null>>) => {
    const next = new URLSearchParams(params.toString());
    for (const key of ORDER) {
      if (!(key in changes)) continue;
      const value = changes[key];
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ORDER.map((dimension) => (
        <label key={dimension} className="inline-flex items-center gap-2">
          <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
            {LABELS[dimension].title}
          </span>

          <span className="relative inline-block">
            <select
              value={cohort.filters[dimension] ?? ""}
              onChange={(event) =>
                router.push(
                  hrefFor({ [dimension]: event.target.value || null } as
                    Partial<Record<Dimension, string | null>>),
                )
              }
              className={cn(
                "h-10 max-w-[13rem] appearance-none rounded-lg border border-gray-200 bg-white",
                "py-0 pr-9 pl-3 text-[13.5px] font-bold text-ink",
                "focus:border-brand focus:outline-none",
                cohort.filters[dimension] && "border-brand",
              )}
            >
              <option value="">{LABELS[dimension].any}</option>
              {cohort.options[dimension].map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label} ({formatNumber(option.ambassadors)})
                </option>
              ))}
            </select>

            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-faint"
            />
          </span>
        </label>
      ))}

      {cohort.active && (
        <button
          type="button"
          onClick={() =>
            router.push(hrefFor({ city: null, college: null, batch: null }))
          }
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold text-ink-soft hover:text-ink"
        >
          <X className="size-3.5" aria-hidden />
          Clear
        </button>
      )}
    </div>
  );
}
