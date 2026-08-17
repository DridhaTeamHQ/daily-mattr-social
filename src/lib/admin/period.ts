/**
 * The stretch of time a dashboard is about.
 *
 * Plain date arithmetic with no database access, so the picker on the client
 * and the queries on the server can share one definition of "this week".
 *
 * Dates are resolved in IST, not in the server's timezone and not in UTC.
 * "Today" has to mean the day the person reading the screen is having: a
 * submission uploaded at 1am IST is 7:30pm UTC the day before, and counting it
 * as yesterday's would make the first hours of every morning look empty. The
 * streak counting in `queries.ts` already works this way, so the two agree.
 *
 * The window is half-open — `[start, end)` — so a submission uploaded exactly
 * at midnight belongs to one day rather than to both.
 */

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

export const PERIODS = [
  { key: "day", label: "Day", noun: "today" },
  { key: "week", label: "Week", noun: "this week" },
  { key: "month", label: "Month", noun: "this month" },
  { key: "total", label: "Total", noun: "to date" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export const DEFAULT_PERIOD: PeriodKey = "month";

/**
 * How finely a chart of this period should be cut.
 *
 * A day has no shape as a run of days, and four years of them is a fence
 * rather than a chart, so the unit follows the span: hours within a day,
 * months across everything, days in between.
 */
export type Grain = "hour" | "day" | "month";

export type Period = {
  key: PeriodKey;
  /** For the picker: "Day". */
  label: string;
  /** For prose: "…campaigns this week". */
  noun: string;
  start: Date;
  /** Exclusive: the instant the period stops covering. */
  end: Date;
  grain: Grain;
  /**
   * Every IST day in the window, oldest first, including the empty ones.
   * Empty for "Total", which is charted by month and has no fixed start.
   */
  days: string[];
};

/** The IST calendar day an instant falls on, as YYYY-MM-DD. */
export function istDay(value: Date | string): string {
  const at = typeof value === "string" ? new Date(value) : value;
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant an IST calendar day begins. */
function istDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - IST_OFFSET_MS);
}

function shiftDays(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + by * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Drop anything the URL made up, and fall back to the month. */
export function readPeriod(raw: string | string[] | undefined): PeriodKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return PERIODS.some((period) => period.key === value)
    ? (value as PeriodKey)
    : DEFAULT_PERIOD;
}

export function resolvePeriod(requested: PeriodKey, now = new Date()): Period {
  // Falls back rather than trusting the argument, so a key that came from a
  // URL cannot produce a period whose window and label disagree.
  const meta =
    PERIODS.find((period) => period.key === requested) ??
    PERIODS.find((period) => period.key === DEFAULT_PERIOD)!;
  const key = meta.key;
  const today = istDay(now);
  const end = istDayStart(shiftDays(today, 1));

  // "Total" has no start: it is everything the programme has ever recorded,
  // so the window opens at the epoch rather than at some arbitrary cutoff
  // that would quietly drop the programme's first weeks.
  if (key === "total") {
    return {
      key,
      label: meta.label,
      noun: meta.noun,
      start: new Date(0),
      end,
      grain: "month",
      days: [],
    };
  }

  // The week is the last seven days rather than "since Monday", and the month
  // is the calendar month. A week that resets on Monday makes every Monday
  // morning look like a collapse; a rolling month would make the same figure
  // mean something different each day it is read.
  const firstDay =
    key === "day"
      ? today
      : key === "week"
        ? shiftDays(today, -6)
        : `${today.slice(0, 7)}-01`;

  const days: string[] = [];
  for (let day = firstDay; day <= today; day = shiftDays(day, 1)) {
    days.push(day);
  }

  return {
    key,
    label: meta.label,
    noun: meta.noun,
    start: istDayStart(firstDay),
    end,
    grain: key === "day" ? "hour" : "day",
    days,
  };
}
