import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * A row of link-shaped filters.
 *
 * Links rather than a client-side control on purpose: the filter belongs in
 * the URL so a view can be shared, bookmarked and reloaded, and so the page
 * stays a Server Component with no hydration cost for what is ultimately a
 * list of anchors.
 *
 * Callers pass the full href for each option, because every page composes its
 * own query string and encoding that here would mean this component knowing
 * about every caller's parameters.
 */
export type ChipOption = {
  key: string;
  label: string;
  href: string;
};

export function FilterChips({
  label,
  options,
  active,
  className,
}: {
  label: string;
  options: ChipOption[];
  active: string;
  className?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
        {label}
      </span>

      {options.map((option) => {
        const isActive = option.key === active;
        return (
          <Link
            key={option.key}
            href={option.href}
            // aria-current is what tells a screen reader which filter is on.
            // Colour alone would leave that state invisible to anyone not
            // seeing the page.
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition-colors",
              isActive
                ? "border-brand bg-brand text-white"
                : "border-gray-200 bg-surface text-ink-soft hover:border-ink/30 hover:text-ink",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
