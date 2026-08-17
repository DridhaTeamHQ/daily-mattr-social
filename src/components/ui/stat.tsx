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
  icon: Icon,
  cornerIcon: CornerIcon,
  tone = "brand",
  interactive = true,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  cornerIcon?: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  /**
   * Whether the tile lifts and shows a pointer on hover.
   *
   * This used to also draw a `>` on the right of every tile it was true for —
   * which is the default, so nearly all of them. Only two screens actually wrap
   * a Stat in a link, so the chevron was promising a destination that mostly
   * did not exist, and it sat close enough to the value to read as part of it.
   * The hover lift is left as the affordance for the tiles that do navigate.
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
      {CornerIcon && (
        <div className="absolute top-4 right-4 rounded-md border border-gray-200 bg-white p-1.5 shadow-sm text-ink-soft">
          <CornerIcon className="size-4" />
        </div>
      )}
      {Icon && (
        <div className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-md", STAT_ICON_BG[tone])}>
          <Icon className="size-7" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold tracking-wide text-ink uppercase">
          {label}
        </p>
        <p className="mt-0.5 text-[28px] font-extrabold leading-tight text-ink">
          {typeof value === "number" ? formatNumber(value) : value}
        </p>
        {sub && (
          <p className="mt-0.5 text-[12px] font-medium text-gray-500">{sub}</p>
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
