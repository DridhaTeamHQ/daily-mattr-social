import Link from "next/link";

import { Card } from "@/components/ui/card";
import { cn, formatNumber, initials } from "@/lib/utils";

/**
 * A ranked list of things, with a few numbers each.
 *
 * The charts say how much in total; this says who. Every analytics category
 * ends in one of these, because "20 downloads" is a fact you can do nothing
 * with and "Fatima drove 11 of them" is a fact you can act on.
 *
 * Deliberately a list rather than a `<table>`: three or four numbers per row
 * read fine as a flex row, and a real table would need horizontal scrolling on
 * a phone to show columns nobody is comparing across anyway.
 */

export type LeagueColumn = {
  label: string;
  /** Rendered right-aligned. Already formatted by the caller. */
  value: string;
  /** Dims the number when it is zero, so a full row of zeroes recedes. */
  muted?: boolean;
};

export type LeagueRow = {
  id: string;
  name: string;
  meta?: string;
  href?: string;
  columns: LeagueColumn[];
  /** Shown in the leading circle. Falls back to initials of the name. */
  badge?: string;
};

export function LeagueTable({
  rows,
  emptyMessage,
  limit = 25,
  showRank = true,
}: {
  rows: LeagueRow[];
  emptyMessage: string;
  limit?: number;
  showRank?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <p className="px-5 py-8 text-center text-[13px] font-semibold text-ink-soft">
          {emptyMessage}
        </p>
      </Card>
    );
  }

  const visible = rows.slice(0, limit);
  const headers = visible[0]?.columns.map((c) => c.label) ?? [];

  return (
    <Card>
      {/* Column labels once at the top, not repeated per row. Hidden on
          phones, where the rows stack and the labels would take a line each. */}
      <div className="hidden items-center gap-3 border-b border-gray-200 px-5 py-2.5 sm:flex">
        {showRank && <span className="w-6 shrink-0" />}
        <span className="w-9 shrink-0" />
        <span className="min-w-0 flex-1 text-[11px] font-bold tracking-wide text-ink-faint uppercase">
          Name
        </span>
        {headers.map((label) => (
          <span
            key={label}
            className="w-20 shrink-0 text-right text-[11px] font-bold tracking-wide text-ink-faint uppercase"
          >
            {label}
          </span>
        ))}
      </div>

      <ul className="divide-y divide-gray-100">
        {visible.map((row, index) => (
          <li key={row.id} className="flex items-center gap-3 px-5 py-3">
            {showRank && (
              <span
                className={cn(
                  "w-6 shrink-0 text-center text-[13px] font-extrabold",
                  index < 3 ? "text-brand" : "text-ink-faint",
                )}
              >
                {index + 1}
              </span>
            )}

            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100 text-[11.5px] font-extrabold text-ink"
            >
              {row.badge ?? initials(row.name)}
            </span>

            <div className="min-w-0 flex-1">
              {row.href ? (
                <Link
                  href={row.href}
                  className="block truncate text-[14px] font-bold text-ink hover:underline"
                >
                  {row.name}
                </Link>
              ) : (
                <p className="truncate text-[14px] font-bold text-ink">
                  {row.name}
                </p>
              )}
              {row.meta && (
                <p className="truncate text-[12px] text-ink-soft">{row.meta}</p>
              )}
            </div>

            {row.columns.map((column) => (
              <span
                key={column.label}
                className={cn(
                  "tabular w-20 shrink-0 text-right text-[14px] font-extrabold",
                  column.muted ? "text-ink-faint" : "text-ink",
                )}
              >
                {/* The label rides along on narrow screens, where the header
                    row is hidden and a bare number means nothing. */}
                <span className="mr-1 text-[10px] font-bold text-ink-faint uppercase sm:hidden">
                  {column.label}
                </span>
                {column.value}
              </span>
            ))}
          </li>
        ))}
      </ul>

      {rows.length > visible.length && (
        <p className="border-t border-gray-200 px-5 py-2.5 text-[12px] font-semibold text-ink-soft">
          Showing the top {visible.length} of {formatNumber(rows.length)}.
        </p>
      )}
    </Card>
  );
}
