import { Lock, Trophy } from "lucide-react";

import { InfoDot } from "@/components/ui/info-dot";
import { cn, formatNumber } from "@/lib/utils";

type StatTone = "brand" | "reel" | "poll" | "invite" | "rank";

const STAT_BG = {
  brand: "bg-gray-50/50 border-gray-100",
  reel: "bg-gray-50/50 border-gray-100",
  poll: "bg-gray-50/50 border-gray-100",
  invite: "bg-gray-50/50 border-gray-100",
  rank: "bg-gray-50/50 border-gray-100",
};

const STAT_ICON_BG = {
  brand: "bg-brand-strong",
  reel: "bg-[#0b5cff]",
  poll: "bg-[#008f6b]",
  invite: "bg-[#6432ff]",
  rank: "bg-black",
};

export function Stat({
  label,
  value,
  sub,
  badge,
  icon: Icon,
  cornerIcon: CornerIcon,
  info,
  tone = "brand",
  interactive = false,
  locked = false,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /**
   * A short pill under the figure, for something worth singling out — a
   * placing, a streak that is still running. Optional and rare on purpose: a
   * badge on every tile is a badge on none of them.
   */
  badge?: string;
  icon?: React.ComponentType<{ className?: string }>;
  cornerIcon?: React.ComponentType<{ className?: string }>;
  /**
   * What the figure means, behind an "i" in the corner.
   *
   * For a number that is right but reads as wrong — one that lags, or counts
   * something narrower than its label suggests. It takes the corner slot, so
   * a tile has an explanation or a corner icon, not both.
   */
  info?: React.ReactNode;
  tone?: StatTone;
  /**
   * The tile is for something not open yet.
   *
   * A padlock takes the icon's place and the colour drains out of the tile,
   * the same way a badge nobody has earned and a tier nobody has reached are
   * drawn. The figure is still shown: locked means "not available to you",
   * not "hidden", and a tile that went blank would read as broken.
   */
  locked?: boolean;
  /**
   * Whether the tile lifts and shows a pointer on hover.
   *
   * Off, unless a caller says otherwise. It used to default to on and to also
   * draw a `>` on the right of the tile — a destination that, for all but the
   * handful of screens wrapping a Stat in a link, did not exist, and it sat
   * close enough to the value to read as part of it. The chevron is gone; the
   * hover lift is left as the affordance for the tiles that do navigate.
   */
  interactive?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-5 rounded-2xl border p-5 sm:p-6 shadow-sm",
        interactive && "transition-all hover:scale-[1.02] hover:bg-gray-50 cursor-pointer",
        STAT_BG[tone],
        className,
      )}
    >
      {info ? (
        <div className="absolute top-4 right-4">
          <InfoDot label={`About ${label.toLowerCase()}`}>{info}</InfoDot>
        </div>
      ) : (
        CornerIcon && (
          <div className="absolute top-4 right-4 rounded-md border border-gray-200 bg-white p-1.5 shadow-sm text-ink-soft">
            <CornerIcon className="size-4" />
          </div>
        )
      )}
      {(Icon || locked) && (
        <div
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-2xl",
            locked
              ? "bg-gray-100 text-gray-400"
              : cn("text-white shadow-md", STAT_ICON_BG[tone]),
          )}
        >
          {locked ? (
            <Lock className="size-6" aria-label="Locked" />
          ) : (
            Icon && <Icon className="size-7" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[12px] font-bold tracking-wide uppercase",
            locked ? "text-ink-soft" : "text-ink",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 text-[28px] font-extrabold leading-tight",
            locked ? "text-gray-400" : "text-ink",
          )}
        >
          {typeof value === "number" ? formatNumber(value) : value}
        </p>
        {sub && (
          <p className="mt-0.5 text-[12px] font-medium text-gray-500">{sub}</p>
        )}
        {badge && !locked && (
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-amber-700">
            <Trophy className="size-3" aria-hidden />
            {badge}
          </p>
        )}
      </div>
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
        "h-3 w-full overflow-hidden rounded-full border border-gray-200 bg-surface",
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
          fill,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
