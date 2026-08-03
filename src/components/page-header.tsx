import * as React from "react";

import { cn } from "@/lib/utils";

type Tone = "brand" | "reel" | "poll" | "invite" | "rank";

const CHIP: Record<Tone, string> = {
  brand: "bg-brand-tint text-brand",
  reel: "bg-reel-tint text-reel",
  poll: "bg-poll-tint text-poll",
  invite: "bg-invite-tint text-invite",
  rank: "bg-rank-tint text-rank",
};

/**
 * The title block at the top of each section. The coloured icon chip is the
 * same accent the nav uses for that destination, so arriving on a page
 * confirms where you are without reading anything.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  tone,
  action,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <span
        aria-hidden
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-sm",
          CHIP[tone],
        )}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
            {description}
          </p>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
