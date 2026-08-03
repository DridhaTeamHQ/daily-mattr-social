import * as React from "react";

import { cn, formatNumber } from "@/lib/utils";

/**
 * Charts, built in plain HTML.
 *
 * No charting library: every mark here is a div with the same black border and
 * hard shadow as the rest of the app, which a library would fight rather than
 * cooperate with. It also keeps the admin bundle free of ~50kB of plotting code
 * for four bar charts.
 *
 * Colour rules being followed deliberately:
 *  - Each chart is a SINGLE series, so no legend is needed — the title names it
 *    — and every bar carries a direct label, so identity is never colour-alone.
 *  - Series colours are darker steps of the UI accents. The raw accents fail a
 *    lightness/contrast check as chart fills; these steps were validated for
 *    colourblind separation and 3:1 against the surface before being used.
 *  - Status charts use the reserved status palette, never a series colour.
 */

export const SERIES = {
  gold: "#b08900",
  pink: "#d1246f",
  teal: "#0891a3",
  orange: "#c2410c",
  violet: "#6d28d9",
} as const;

export type SeriesColor = keyof typeof SERIES;

export function ChartCard({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("brut rounded-md bg-surface p-5", className)}>
      <h2 className="display text-[16px] text-ink">{title}</h2>
      {hint && (
        <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">{hint}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Horizontal bars.
 *
 * Horizontal because the labels are names and survey titles — rotated x-axis
 * labels are the most common way a readable chart becomes an unreadable one.
 */
export function BarList({
  data,
  color = "gold",
  unit = "",
  emptyMessage = "Nothing yet.",
}: {
  data: { label: string; value: number; sub?: string; color?: string }[];
  color?: SeriesColor;
  unit?: string;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
        {emptyMessage}
      </p>
    );
  }

  // Scale to the largest bar, not to a rounded axis maximum: with no axis
  // drawn, the widest bar filling the track is the clearest reference there is.
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="space-y-3">
      {data.map((row) => {
        const pct = Math.max(2, Math.round((row.value / max) * 100));

        return (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] font-extrabold text-ink">
                {row.label}
              </span>
              {/* Direct label on every bar — the value is never something you
                  have to estimate against an axis. */}
              <span className="tabular shrink-0 text-[13px] font-extrabold text-ink">
                {formatNumber(row.value)}
                {unit}
              </span>
            </div>

            {row.sub && (
              <p className="truncate text-[11.5px] font-semibold text-ink-soft">
                {row.sub}
              </p>
            )}

            <div
              className="mt-1.5 h-4 overflow-hidden rounded-full border-[3px] border-ink bg-canvas-sunk"
              role="img"
              aria-label={`${row.label}: ${row.value}${unit}`}
            >
              <div
                className={cn(
                  "h-full rounded-r-full transition-[width] duration-500 ease-out",
                  pct < 100 && "border-r-[3px] border-ink",
                )}
                style={{
                  width: `${pct}%`,
                  backgroundColor: row.color ?? SERIES[color],
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Vertical bars over time.
 *
 * Every day in the window is rendered, including the empty ones — dropping zero
 * days silently compresses a quiet week into a busy-looking chart.
 */
export function DayBars({
  data,
  color = "violet",
  unit = "",
}: {
  data: { day: string; value: number }[];
  color?: SeriesColor;
  unit?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((n, d) => n + d.value, 0);

  if (total === 0) {
    return (
      <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
        Nothing earned in this window yet.
      </p>
    );
  }

  return (
    <>
      <div className="flex h-40 items-end gap-[3px]">
        {data.map((d) => {
          const pct = d.value === 0 ? 0 : Math.max(4, (d.value / max) * 100);
          const label = new Date(d.day).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          });

          return (
            <div
              key={d.day}
              className="group relative flex h-full flex-1 items-end"
              // Native tooltip: an admin chart doesn't need a bespoke hover
              // layer to answer "what was that day".
              title={`${label}: ${formatNumber(d.value)}${unit}`}
            >
              {d.value > 0 ? (
                <div
                  className="w-full rounded-t-[4px] border-2 border-ink transition-[height] duration-500 ease-out"
                  style={{ height: `${pct}%`, backgroundColor: SERIES[color] }}
                />
              ) : (
                // A visible floor for empty days, so the gap reads as "zero"
                // rather than as missing data.
                <div className="h-[3px] w-full rounded-full bg-ink/15" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-[11.5px] font-bold text-ink-soft">
        <span>
          {new Date(data[0].day).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </span>
        <span>Today</span>
      </div>
    </>
  );
}

/** The plain-numbers view of a chart, for anyone the bars don't serve. */
export function DataTable({
  caption,
  rows,
  unit = "",
}: {
  caption: string;
  rows: { label: string; value: number }[];
  unit?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-[12.5px] font-extrabold text-ink-soft hover:text-ink">
        View as a table
      </summary>

      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <tbody className="divide-y-2 divide-ink/15">
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="py-1.5 text-[12.5px] font-semibold text-ink-soft"
              >
                {row.label}
              </th>
              <td className="tabular py-1.5 text-right text-[12.5px] font-extrabold text-ink">
                {formatNumber(row.value)}
                {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
