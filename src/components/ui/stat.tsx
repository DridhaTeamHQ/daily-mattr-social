import * as React from "react";
import { cn, formatNumber } from "@/lib/utils";

type StatTone = "brand" | "reel" | "poll" | "invite" | "rank";

/** Icon chip colours. The number itself stays ink — colour marks the
 *  category, it doesn't compete with the figure. */
const STAT_TONES: Record<StatTone, string> = {
  brand: "bg-brand-tint text-brand",
  reel: "bg-reel-tint text-reel",
  poll: "bg-poll-tint text-poll",
  invite: "bg-invite-tint text-invite",
  rank: "bg-rank-tint text-rank",
};

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "brand",
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-surface border border-line rounded-md shadow-card p-4",
        "transition-shadow duration-150 ease-out hover:shadow-raised",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-soft">{label}</p>
        {Icon && (
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-xs",
              STAT_TONES[tone],
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="tabular text-[28px] font-semibold text-ink mt-2 leading-none">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {sub && <p className="text-[12.5px] text-ink-soft mt-2">{sub}</p>}
    </div>
  );
}

/**
 * The points hero on the ambassador dashboard. This is deliberately the
 * biggest thing on the page — it's the reason students come back.
 */
export function PointsHero({
  points,
  rank,
  total,
  className,
}: {
  points: number;
  rank: number | null;
  total: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-brand-gradient relative overflow-hidden rounded-lg",
        "px-6 py-7 text-white shadow-raised sm:px-8 sm:py-9",
        className,
      )}
    >
      <div className="relative z-10">
        <p className="text-[13px] font-medium text-white/75">Your points</p>
        <p className="tabular mt-1 text-[56px] leading-[1.02] font-semibold sm:text-[68px]">
          {formatNumber(points)}
        </p>

        {rank !== null && total > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[13px] text-white/90 backdrop-blur-sm">
            Rank <span className="font-semibold text-white">#{rank}</span> of{" "}
            {total} {total === 1 ? "ambassador" : "ambassadors"}
          </p>
        )}
      </div>

      {/* Decorative light. Purely atmospheric — nothing readable sits on it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-white/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-16 size-64 rounded-full bg-white/10 blur-3xl"
      />
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  className,
  tone = "brand",
}: {
  value: number;
  max: number;
  className?: string;
  tone?: "brand" | "ok";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cn("h-1.5 rounded-full bg-canvas-sunk overflow-hidden", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out",
          tone === "brand" ? "bg-brand" : "bg-ok",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
