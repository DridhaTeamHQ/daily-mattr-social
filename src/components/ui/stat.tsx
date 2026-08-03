import * as React from "react";
import { cn, formatNumber } from "@/lib/utils";

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-surface border border-line rounded-md shadow-card p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-soft">{label}</p>
        {Icon && <Icon className="size-4 text-ink-faint shrink-0" />}
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
        "relative overflow-hidden rounded-lg border border-brand-line",
        "bg-gradient-to-br from-brand-tint via-brand-tint to-surface",
        "px-6 py-7 sm:px-8 sm:py-8",
        className,
      )}
    >
      <p className="text-[13px] font-medium text-brand-press/80">Your points</p>
      <p className="tabular text-[52px] sm:text-[64px] font-semibold text-brand-press leading-[1.05] mt-1">
        {formatNumber(points)}
      </p>

      {rank !== null && total > 0 && (
        <p className="text-[13.5px] text-brand-press/80 mt-2">
          Rank <span className="font-semibold">#{rank}</span> of {total}{" "}
          {total === 1 ? "ambassador" : "ambassadors"}
        </p>
      )}

      {/* Soft decorative wash — no neon, just depth. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/50 blur-2xl"
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
