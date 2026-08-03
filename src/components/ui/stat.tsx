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
