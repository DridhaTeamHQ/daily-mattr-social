"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { cn, formatNumber } from "@/lib/utils";

/**
 * A URL-backed `<select>`: one querystring param, one chosen value.
 *
 * The same reasoning as the search box it sits beside — the choice lives in
 * the URL, so one batch's ranking can be linked, reloaded and shared, and
 * every other param is kept, so narrowing to a batch does not throw away the
 * name being searched for. A native select for the reasons the cohort filter
 * uses one: one tab stop, the platform picker on a phone, and no open/close
 * state to get wrong.
 */
export function ParamSelect({
  param,
  label,
  any,
  value,
  options,
  className,
}: {
  param: string;
  /** Small caps caption to the left of the control. */
  label: string;
  /** What the empty choice is called — "All batches". */
  any: string;
  /** The value the page is currently using, or null for `any`. */
  value: string | null;
  /** `label` is what the option says; it defaults to the value itself. */
  options: { value: string; label?: string; count?: number }[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const choose = (next: string) => {
    const query = new URLSearchParams(params.toString());
    if (next) query.set(param, next);
    else query.delete(param);
    const search = query.toString();
    router.push(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  return (
    <label className={cn("inline-flex items-center gap-2", className)}>
      <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
        {label}
      </span>

      <span className="relative inline-block">
        <select
          value={value ?? ""}
          onChange={(event) => choose(event.target.value)}
          className={cn(
            "h-10 max-w-[13rem] appearance-none rounded-lg border border-gray-200 bg-white",
            "py-0 pr-9 pl-3 text-[13.5px] font-bold text-ink",
            "focus:border-brand focus:outline-none",
            value && "border-brand",
          )}
        >
          <option value="">{any}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label ?? option.value}
              {option.count !== undefined && ` (${formatNumber(option.count)})`}
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
