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

  /**
   * How often to print a date under a bar.
   *
   * Every bar gets one where they fit, which is what makes the chart
   * readable — a run of bars with a date at each end tells you the range and
   * nothing about any particular day, so finding "the spike on the 9th"
   * meant counting columns with a finger. Past about sixteen days the labels
   * would collide, so they thin out to every second, third or fourth,
   * anchored on the last day so the right-hand end always reads "today".
   */
  const step = Math.ceil(data.length / 16);

  /**
   * Bars are drawn on a fixed track rather than stretched to fill.
   *
   * A campaign with three days of data used to get three columns a third of
   * the card wide each, which reads as a different chart from the same
   * campaign a week later. Fixed-width bars keep a day the same size
   * whatever else is on screen, and the row scrolls if there are more than
   * fit — which is also what keeps a fat bar fat.
   */
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-full items-end justify-between gap-1.5">
        {data.map((d, index) => {
          const pct = d.value === 0 ? 0 : Math.max(6, (d.value / max) * 100);
          const at = new Date(d.day);
          const label = at.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          });
          // Counted back from the end, so today is always labelled.
          const labelled = (data.length - 1 - index) % step === 0;

          return (
            <div
              key={d.day}
              className="flex min-w-[18px] flex-1 flex-col items-center gap-1.5"
              // Native tooltip: an admin chart doesn't need a bespoke hover
              // layer to answer "what was that day".
              title={`${label}: ${formatNumber(d.value)}${unit}`}
            >
              <div className="flex h-36 w-full items-end">
                {d.value > 0 ? (
                  <div
                    className="w-full rounded-t-md border-2 border-ink transition-[height] duration-500 ease-out"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: SERIES[color],
                    }}
                  />
                ) : (
                  // A visible floor for empty days, so the gap reads as
                  // "zero" rather than as missing data.
                  <div className="h-[3px] w-full rounded-full bg-ink/15" />
                )}
              </div>

              {/* The day number under every labelled bar, with the month only
                  where it changes — thirty repetitions of "Aug" is noise, and
                  the one place the month turns over is the one place you
                  need it. */}
              <span className="h-7 text-center text-[10.5px] leading-tight font-bold whitespace-nowrap text-ink-soft">
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
