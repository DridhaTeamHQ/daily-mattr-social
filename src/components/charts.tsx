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

/**
 * A running total over time.
 *
 * Daily bars are the obvious form and the wrong one for this data. Approvals
 * arrive in bursts — a reviewer clears twelve on Tuesday and none until Friday
 * — so a month of them is three spikes and fourteen empty slots pushed against
 * one edge. It reads as a chart that failed to load rather than a quiet
 * fortnight.
 *
 * A cumulative line has no gaps to misread. Its height is the total so far and
 * its slope is the pace, which is what an admin is actually asking: are we
 * still moving, and how fast. Flat stretches say "nothing happened" without
 * looking like missing data.
 *
 * One series, so no legend — the card title names it — and only the endpoint
 * is labelled. A number on every point is chaos, and the per-day figures are
 * in the table underneath, which is also the answer for anyone the hover
 * tooltips don't serve.
 */
export function TrendArea({
  data,
  color = "violet",
  /** Names the total, e.g. "approved this month". */
  caption,
  unit = "",
}: {
  data: { day: string; value: number }[];
  color?: SeriesColor;
  caption: string;
  unit?: string;
}) {
  const total = data.reduce((sum, point) => sum + point.value, 0);

  if (data.length === 0 || total === 0) {
    return (
      <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
        Nothing in this window yet.
      </p>
    );
  }

  // The plot is inset from the top and bottom of the box so a 2px line at the
  // ceiling or the floor is not sliced in half by the edge.
  const TOP = 4;
  const FLOOR = 96;
  const height = FLOOR - TOP;

  const runningTotals: number[] = [];
  for (const point of data) {
    runningTotals.push((runningTotals[runningTotals.length - 1] ?? 0) + point.value);
  }

  const points = data.map((point, index) => ({
    ...point,
    running: runningTotals[index],
    x: data.length === 1 ? 0 : (index / (data.length - 1)) * 100,
    y: FLOOR - (runningTotals[index] / total) * height,
  }));

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const area = `${line} L 100 ${FLOOR} L ${points[0].x} ${FLOOR} Z`;
  const last = points[points.length - 1];

  const busiest = data.reduce((best, point) =>
    point.value > best.value ? point : best,
  );
  const activeDays = data.filter((point) => point.value > 0).length;
  const fill = SERIES[color];
  const gradient = `trend-${color}`;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {/* The headline is the number, not the shape — the chart is there to
            say how it got there. Proportional figures: tabular ones look
            gappy at this size, and nothing is aligning under it. */}
        <p className="text-[30px] leading-none font-black text-ink">
          {formatNumber(total)}
        </p>
        <p className="text-[12.5px] font-semibold text-ink-soft">{caption}</p>
        <p className="ml-auto text-[12px] font-semibold text-ink-soft">
          {formatNumber(busiest.value)} on the busiest day ·{" "}
          {activeDays === 1 ? "1 active day" : `${activeDays} active days`}
        </p>
      </div>

      <div className="relative mt-4 h-40">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`${formatNumber(total)}${unit} ${caption}, rising over ${data.length} days`}
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity="0.28" />
              <stop offset="100%" stopColor={fill} stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* Solid hairlines, a shade off the surface: a grid is context, and
              dashes would read as a threshold that isn't there. */}
          <line
            x1="0"
            y1={TOP}
            x2="100"
            y2={TOP}
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="text-gray-200"
          />
          <line
            x1="0"
            y1={FLOOR}
            x2="100"
            y2={FLOOR}
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="text-gray-300"
          />

          <path d={area} fill={`url(#${gradient})`} />
          <path
            d={line}
            fill="none"
            stroke={fill}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Full-height hit columns rather than the line itself: a 2px stroke
              is not something anyone should have to aim at. */}
          {points.map((point, index) => (
            <rect
              key={point.day}
              x={(index * 100) / points.length}
              y="0"
              width={100 / points.length}
              height="100"
              fill="transparent"
            >
              <title>
                {`${dayLabel(point.day)}: ${formatNumber(point.value)}${unit} · ${formatNumber(point.running)} so far`}
              </title>
            </rect>
          ))}
        </svg>

        {/* The one direct label, on the one point worth labelling. */}
        <span
          className="absolute -translate-x-full -translate-y-1/2 rounded-full border-2 border-surface"
          style={{
            left: "100%",
            top: `${last.y}%`,
            width: 10,
            height: 10,
            backgroundColor: fill,
          }}
          aria-hidden
        />
      </div>

      <div className="mt-2 flex justify-between text-[11.5px] font-bold text-ink-soft">
        <span>{dayLabel(data[0].day)}</span>
        <span>Today</span>
      </div>

      <DataTable
        caption={caption}
        rows={data.map((point) => ({
          label: dayLabel(point.day),
          value: point.value,
        }))}
        unit={unit}
      />
    </>
  );
}

function dayLabel(day: string): string {
  return new Date(day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
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
