import Link from "next/link";
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
 * A bar row, as a link when the caller gave it somewhere to go.
 *
 * The accessible name is the label alone: the figure and the bar beside it are
 * already announced by the row's own text and its `role="img"`, and repeating
 * them in the link name reads the number twice.
 */
function Row({
  href,
  label,
  children,
}: {
  href?: string;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) return <>{children}</>;

  return (
    <Link
      href={href}
      aria-label={label}
      className="group block rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-ink"
    >
      {children}
    </Link>
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
  data: {
    /**
     * The row's real identity, when the caller has one — a campaign id, a
     * profile id. Optional, and never inferred from `label`: two campaigns can
     * share a title and two ambassadors can share a name, so a label is a
     * caption, not a key. React only warned about it once a duplicate title
     * actually existed, which is late to find out.
     */
    id?: string;
    label: string;
    value: number;
    sub?: string;
    color?: string;
    /**
     * Where the row goes when it is clicked — the thing the bar is about, so
     * a figure that raises a question can be opened rather than copied into
     * the search box. Rows without one stay plain text; a list is allowed to
     * be a mix, and nothing about the bar changes except that it becomes a
     * link.
     */
    href?: string;
  }[];
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
      {data.map((row, index) => {
        const pct = Math.max(2, Math.round((row.value / max) * 100));

        return (
          // Position is the fallback, not the label. These lists are built
          // fresh on the server for every render and hold no focus or input
          // state, so there is nothing for an index key to corrupt.
          <li key={row.id ?? index}>
            {/* One link around the whole row, not a separate "view" control:
                the label, the figure and the bar are all the same subject, and
                a target the width of the card is easier to hit than a word at
                the end of it. `Fragment` when there is nowhere to go, so a
                plain list renders exactly the markup it always did. */}
            <Row href={row.href} label={row.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "truncate text-[13px] font-extrabold text-ink",
                    row.href && "group-hover:underline",
                  )}
                >
                  {row.label}
                </span>
                {/* Direct label on every bar — the value is never something
                    you have to estimate against an axis. */}
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
                className={cn(
                  "mt-1.5 h-4 overflow-hidden rounded-full border-[3px] border-ink bg-canvas-sunk",
                  row.href && "group-hover:border-brand",
                )}
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
            </Row>
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
 *
 * Drawn soft rather than outlined: rounded columns with a gradient, faint
 * gridlines for scale, and the figure printed on every day that has one, so
 * nobody has to read a height against an axis. The summary above gives the
 * total and the busiest day, which is what the chart is usually opened for.
 */
export function DayBars({
  data,
  color = "violet",
  unit = "",
  noun = "in this window",
}: {
  data: { day: string; value: number }[];
  color?: SeriesColor;
  unit?: string;
  /** What a bar counts, for the summary line: "48 uploads". */
  noun?: string;
}) {
  const total = data.reduce((n, d) => n + d.value, 0);

  if (total === 0) {
    return (
      <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
        Nothing in this window yet.
      </p>
    );
  }

  // A rounded top for the scale, so the gridlines land on whole numbers.
  const peak = Math.max(...data.map((d) => d.value), 1);
  const stepSize = Math.max(1, Math.ceil(peak / 4));
  const max = stepSize * 4;
  const grid = [4, 3, 2, 1, 0].map((n) => n * stepSize);

  const busiest = data.reduce((best, d) => (d.value > best.value ? d : best));
  const activeDays = data.filter((d) => d.value > 0).length;
  const fill = SERIES[color];

  // Thin the date labels past about sixteen days, anchored on the last day
  // so the right-hand end always reads "today".
  const step = Math.ceil(data.length / 16);

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[28px] leading-none font-black text-ink">
          {formatNumber(total)}
        </p>
        <p className="text-[12.5px] font-semibold text-ink-soft">
          {noun} · busiest {dayLabel(busiest.day)} ({formatNumber(busiest.value)}) ·{" "}
          {activeDays} active {activeDays === 1 ? "day" : "days"}
        </p>
      </div>

      <div className="mt-2 flex gap-2">
        {/* Y axis: the gridline values against the plot. The top padding on
            both sides is room for the figure printed over the tallest bar,
            which the scroll container would otherwise clip. */}
        <div className="relative mt-6 h-40 w-6 shrink-0">
          {grid.map((value) => (
            <span
              key={value}
              className="tabular absolute right-0 -translate-y-1/2 text-[10.5px] font-semibold text-ink-faint"
              style={{ top: `${100 - (value / max) * 100}%` }}
            >
              {value}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto pt-6 pb-1">
          <div className="relative min-w-full">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40">
              {grid.map((value) => (
                <div
                  key={value}
                  className={cn(
                    "absolute inset-x-0 border-t",
                    value === 0 ? "border-gray-300" : "border-dashed border-gray-200",
                  )}
                  style={{ top: `${100 - (value / max) * 100}%` }}
                />
              ))}
            </div>

            <div className="relative flex items-end gap-1.5">
              {data.map((d, index) => {
                const pct = (d.value / max) * 100;
                const at = new Date(d.day);
                const label = dayLabel(d.day);
                const labelled = (data.length - 1 - index) % step === 0;
                const isPeak = d.value > 0 && d.value === busiest.value;

                return (
                  <div
                    key={d.day}
                    className="group flex min-w-[18px] flex-1 flex-col items-center"
                    title={`${label}: ${formatNumber(d.value)}${unit}`}
                  >
                    <div className="flex h-40 w-full items-end justify-center">
                      {d.value > 0 && (
                        <div
                          className="relative w-full max-w-[34px] rounded-t-lg transition-[height,filter] duration-500 ease-out group-hover:brightness-110"
                          style={{
                            height: `${pct}%`,
                            background: `linear-gradient(to top, color-mix(in srgb, ${fill} ${isPeak ? 100 : 75}%, white), color-mix(in srgb, ${fill} ${isPeak ? 80 : 45}%, white))`,
                          }}
                        >
                          <span className="tabular absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-ink">
                            {formatNumber(d.value)}
                          </span>
                        </div>
                      )}
                    </div>

                    <span className="mt-1.5 h-7 text-center text-[10.5px] leading-tight font-semibold whitespace-nowrap text-ink-soft">
                      {labelled && (
                        <>
                          {at.getDate()}
                          {(index === 0 ||
                            at.getMonth() !== new Date(data[index - 1].day).getMonth()) && (
                            <>
                              <br />
                              <span className="text-ink-faint">
                                {at.toLocaleDateString("en-IN", { month: "short" })}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Parts of a whole, as a ring.
 *
 * For a status split with a handful of parts — approved, rejected, waiting —
 * where the question is "what share". The total sits in the middle and every
 * part is named in the legend with its count and share, so the ring is never
 * the only place a number lives.
 */
export function Donut({
  data,
  totalLabel = "total",
  emptyMessage = "Nothing yet.",
}: {
  data: { label: string; value: number; color: string }[];
  /** Under the figure in the middle: "submissions". */
  totalLabel?: string;
  emptyMessage?: string;
}) {
  const parts = data.filter((d) => d.value > 0);
  const total = parts.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
        {emptyMessage}
      </p>
    );
  }

  // A circle whose circumference is 100, so every arc length is a percentage.
  const radius = 15.9155;
  const gap = parts.length > 1 ? 1.2 : 0;
  // Each arc starts where the ones before it ended, from twelve o'clock.
  const arcs = parts.map((d, index) => {
    const share = (d.value / total) * 100;
    const before = parts
      .slice(0, index)
      .reduce((sum, p) => sum + (p.value / total) * 100, 0);
    return { ...d, share, length: Math.max(0, share - gap), offset: 25 - before };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-40 shrink-0">
        <svg
          viewBox="0 0 42 42"
          className="size-full"
          role="img"
          aria-label={parts.map((d) => `${d.label}: ${d.value}`).join(", ")}
        >
          <circle cx="21" cy="21" r={radius} fill="none" stroke="#f1f1f3" strokeWidth="5" />
          {arcs.map((d) => (
            <circle
              key={d.label}
              cx="21"
              cy="21"
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth="5"
              strokeDasharray={`${d.length} ${100 - d.length}`}
              strokeDashoffset={d.offset}
            >
              <title>{`${d.label}: ${d.value} (${Math.round(d.share)}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[26px] leading-none font-black text-ink">
              {formatNumber(total)}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-ink-soft">{totalLabel}</p>
          </div>
        </div>
      </div>

      <ul className="min-w-[10rem] flex-1 space-y-3">
        {arcs.map((d) => {
          const share = Math.round(d.share);
          return (
            <li key={d.label}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  {d.label}
                </span>
                <span className="tabular text-[13px] font-extrabold text-ink">
                  {formatNumber(d.value)}
                  <span className="ml-1.5 font-semibold text-ink-faint">{share}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${share}%`, backgroundColor: d.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
          // The date itself, not the rendered label — "26 Aug" repeats once the
          // window is longer than a year.
          id: point.day,
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
  /** Same rule as `BarList`: `id` when there is one, never the label. */
  rows: { id?: string; label: string; value: number }[];
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
          {rows.map((row, index) => (
            <tr key={row.id ?? index}>
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

/**
 * Vertical columns, one per group.
 *
 * For a handful of short category labels — batches, completion bands — where
 * a row of columns reads as a comparison at a glance and the labels fit
 * underneath without rotating. Names and titles still belong in `BarList`.
 * One series, so one colour; `highlight` lifts a single column (the leader,
 * the one selected) to the strong colour and leaves the rest muted, which is
 * the only emphasis the chart needs.
 */
export function ColumnChart({
  data,
  color = "teal",
  unit = "",
  max: fixedMax,
  emptyMessage = "Nothing yet.",
}: {
  data: {
    id?: string;
    label: string;
    value: number;
    sub?: string;
    href?: string;
    highlight?: boolean;
  }[];
  color?: SeriesColor;
  unit?: string;
  /** A fixed top for the scale — 100 for percentages, so 40% looks like 40%. */
  max?: number;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
        {emptyMessage}
      </p>
    );
  }

  const max = fixedMax ?? Math.max(...data.map((d) => d.value), 1);
  const anyHighlight = data.some((d) => d.highlight);

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex min-w-full items-end gap-2">
        {data.map((d, index) => {
          const pct = d.value === 0 ? 0 : Math.max(4, (d.value / max) * 100);
          const strong = !anyHighlight || d.highlight;
          const column = (
            <div className="flex flex-col items-center gap-1.5">
              <span className="tabular text-[13px] font-extrabold text-ink">
                {formatNumber(d.value)}
                {unit}
              </span>
              <div
                className="flex h-40 w-full items-end"
                role="img"
                aria-label={`${d.label}: ${d.value}${unit}`}
              >
                {d.value > 0 ? (
                  <div
                    className="w-full rounded-t-md border-2 border-ink transition-[height] duration-500 ease-out group-hover:border-brand"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: SERIES[color],
                      opacity: strong ? 1 : 0.45,
                    }}
                  />
                ) : (
                  <div className="h-[3px] w-full rounded-full bg-ink/15" />
                )}
              </div>
              <span
                className={cn(
                  "max-w-full truncate text-center text-[12px] font-extrabold text-ink",
                  d.href && "group-hover:underline",
                )}
              >
                {d.label}
              </span>
              {d.sub && (
                <span className="-mt-1 max-w-full truncate text-center text-[11px] font-semibold text-ink-soft">
                  {d.sub}
                </span>
              )}
            </div>
          );

          return (
            <li
              key={d.id ?? index}
              className="min-w-[44px] flex-1"
              title={`${d.label}: ${formatNumber(d.value)}${unit}${d.sub ? ` · ${d.sub}` : ""}`}
            >
              <Row href={d.href} label={d.label}>
                {column}
              </Row>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A grid of percentages — rows by columns — shaded by value.
 *
 * Built for "which task is lagging in which batch": the eye finds the pale
 * cell in a row faster than it reads a table of numbers, and every cell still
 * prints its figure, so the shade is never the only carrier of the value.
 * A cell with nothing to measure (nobody in that group could reach the task)
 * is a dash, not a 0% — zero is a result, the dash is an absence.
 */
export function Heatmap({
  rows,
  columns,
  color = "teal",
  rowHeader = "",
}: {
  rows: {
    id: string;
    label: string;
    href?: string;
    cells: ({ value: number; sub?: string } | null)[];
  }[];
  columns: { id: string; label: string; href?: string }[];
  color?: SeriesColor;
  rowHeader?: string;
}) {
  if (rows.length === 0 || columns.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
        Nothing yet.
      </p>
    );
  }

  const fill = SERIES[color];

  return (
    // Capped in height with the batch names pinned, so a long run of tasks
    // scrolls inside the card instead of pushing everything else off screen.
    <div className="-mx-1 max-h-[26rem] overflow-auto px-1 pb-1">
      <table className="w-full min-w-[32rem] border-separate border-spacing-x-1 border-spacing-y-1 text-left">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th className="px-1 pb-1 text-[11.5px] font-medium tracking-wide text-ink-faint uppercase">
              {rowHeader}
            </th>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="min-w-[72px] px-1 pb-1 text-center text-[12px] font-extrabold text-ink"
              >
                {column.href ? (
                  <Link href={column.href} className="hover:underline">
                    {column.label}
                  </Link>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                className="max-w-[18rem] truncate pr-2 text-[12.5px] font-bold text-ink"
              >
                {row.href ? (
                  <Link href={row.href} className="hover:underline" title={row.label}>
                    {row.label}
                  </Link>
                ) : (
                  <span title={row.label}>{row.label}</span>
                )}
              </th>
              {row.cells.map((cell, index) => {
                if (!cell) {
                  return (
                    <td
                      key={columns[index]?.id ?? index}
                      className="rounded-md bg-gray-50 py-1.5 text-center text-[12px] font-bold text-ink-faint"
                    >
                      —
                    </td>
                  );
                }
                // Shade from a wash at 0% to the full series colour at 100%,
                // with the text flipping to white once the fill is dark
                // enough to need it.
                const alpha = 0.06 + (cell.value / 100) * 0.74;
                const dark = cell.value >= 70;
                return (
                  <td
                    key={columns[index]?.id ?? index}
                    title={`${row.label} · ${columns[index]?.label}: ${cell.value}%${cell.sub ? ` (${cell.sub})` : ""}`}
                    className={cn(
                      "tabular rounded-md py-1.5 text-center text-[12px] font-bold",
                      dark ? "text-white" : "text-ink",
                    )}
                    style={{
                      backgroundColor: `color-mix(in srgb, ${fill} ${Math.round(alpha * 100)}%, transparent)`,
                    }}
                  >
                    {cell.value}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
