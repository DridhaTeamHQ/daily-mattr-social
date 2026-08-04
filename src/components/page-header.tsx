import * as React from "react";

import { cn } from "@/lib/utils";

type Tone = "brand" | "reel" | "poll" | "invite" | "rank";

const FILL: Record<Tone, string> = {
  brand: "bg-brand",
  reel: "bg-reel",
  poll: "bg-poll",
  invite: "bg-invite",
  rank: "bg-rank",
};

const TEXT_TONE: Record<Tone, string> = {
  brand: "text-brand",
  reel: "text-reel",
  poll: "text-poll",
  invite: "text-invite",
  rank: "text-rank",
};

export function PageHeader({
  title,
  description,
  icon: Icon,
  tone,
  action,
  variant = "solid",
  className,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  action?: React.ReactNode;
  variant?: "solid" | "outline";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-[14px] p-5 shadow-sm",
        variant === "solid" ? cn("text-white", FILL[tone]) : "bg-white border border-gray-200 text-ink",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center",
          variant === "solid"
            ? cn("size-12 rounded-xl bg-white", TEXT_TONE[tone])
            : cn("size-14 rounded-full text-white", FILL[tone])
        )}
      >
        <Icon className={cn(variant === "solid" ? "size-6" : "size-7")} />
      </span>

      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-extrabold uppercase tracking-wide leading-none">{title}</h1>
        {description && (
          <p className={cn("mt-1.5 text-[13.5px] leading-relaxed font-medium", variant === "solid" ? "text-white/90" : "text-ink-soft")}>
            {description}
          </p>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
