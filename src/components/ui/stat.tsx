import * as React from "react";
import { cn, formatNumber } from "@/lib/utils";

type StatTone = "brand" | "reel" | "poll" | "invite" | "rank";

/**
 * The whole tile takes the section colour, not just an icon chip. At the size
 * these render on a phone, a small tinted square is invisible — the block of
 * colour is what makes the row scannable.
 */
const STAT_TONES: Record<StatTone, string> = {
  brand: "bg-brand",
  reel: "bg-reel-tint",
  poll: "bg-poll-tint",
  invite: "bg-invite-tint",
  rank: "bg-rank-tint",
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
        "brut lift tap tap-brut rounded-md p-4",
        STAT_TONES[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-extrabold tracking-wide text-ink uppercase">
          {label}
        </p>
        {Icon && (
          <span className="brut-sm grid size-8 shrink-0 place-items-center rounded-xs bg-surface">
            <Icon className="size-4 text-ink" />
          </span>
        )}
      </div>

      <p className="display tabular mt-2.5 text-[32px] leading-none text-ink">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>

      {sub && (
        <p className="mt-2 text-[12.5px] font-semibold text-ink/70">{sub}</p>
      )}
    </div>
  );
}

/** Chunky outlined progress bar. The fill has its own right-hand border so it
 *  reads as a solid block sliding along a track, not a coloured gradient. */
export function ProgressBar({
  value,
  max,
  className,
  tone = "brand",
}: {
  value: number;
  max: number;
  className?: string;
  tone?: "brand" | "ok" | "reel" | "poll" | "invite" | "rank";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  const fill = {
    brand: "bg-brand",
    ok: "bg-ok",
    reel: "bg-reel",
    poll: "bg-poll",
    invite: "bg-invite",
    rank: "bg-rank",
  }[tone];

  return (
    <div
      className={cn(
        "h-4 overflow-hidden rounded-full border-[3px] border-ink bg-surface",
        className,
      )}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn(
          "h-full transition-[width] duration-500 ease-out",
          pct > 0 && pct < 100 && "border-r-[3px] border-ink",
          fill,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
