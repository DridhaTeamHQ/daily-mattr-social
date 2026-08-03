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

/**
 * The title block at the top of each section.
 *
 * The whole strip takes the section's colour rather than a small icon chip —
 * arriving on a page should be unmistakable before you read the heading, which
 * is the entire point of giving each section a colour in the first place.
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
    <div
      className={cn(
        "brut flex flex-wrap items-center gap-3.5 rounded-md p-4",
        FILL[tone],
      )}
    >
      <span
        aria-hidden
        className="brut-sm grid size-11 shrink-0 place-items-center rounded-sm bg-surface"
      >
        <Icon className="size-5.5 text-ink" />
      </span>

      <div className="min-w-0 flex-1">
        <h1 className="display text-[22px] leading-none text-ink">{title}</h1>
        {description && (
          <p className="mt-1.5 text-[13px] leading-relaxed font-semibold text-ink/75">
            {description}
          </p>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
