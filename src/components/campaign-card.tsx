"use client";

import * as React from "react";
import { ChevronDown, Megaphone, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A campaign, collapsed to its headline until you ask for the detail.
 *
 * The tasks, their upload buttons and the reel link are all server-rendered on
 * the page and slotted in as `children` — this component owns nothing but the
 * open/closed state and the summary row, so nothing about a task had to move
 * to the client to make the card fold.
 *
 * The summary carries the three things worth scanning across a list of
 * campaigns: what it is, how much work is left, and what it pays.
 */
export function CampaignCard({
  id,
  variant,
  title,
  description,
  deadlineLabel,
  ended,
  taskCount,
  doneCount,
  points,
  earnedPoints,
  children,
}: {
  id: string;
  variant: "clip" | "reel";
  title: string;
  description: string | null;
  deadlineLabel: string;
  ended: boolean;
  taskCount: number;
  doneCount: number;
  /** What the campaign is worth in total. */
  points: number;
  /** What has actually been credited so far. */
  earnedPoints: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const Icon = variant === "clip" ? Video : Megaphone;
  const bodyId = `campaign-${id}-body`;

  const allDone = taskCount > 0 && doneCount === taskCount;

  return (
    <Card id={id} className="scroll-mt-20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="tap flex w-full flex-wrap items-center gap-x-4 gap-y-3 p-6 text-left transition-colors hover:bg-canvas-sunk"
      >
        <span
          aria-hidden
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-xl",
            variant === "clip"
              ? "bg-brand-tint text-brand-strong"
              : "bg-gray-100 text-gray-800",
          )}
        >
          <Icon className="size-6" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            {/* A live campaign is the only one you can still act on, so its
                title carries the brand colour and an ended one drops back to
                grey. Colour alone would be a weak signal, but the deadline
                badge beside it says the same thing in words. */}
            <span
              className={cn(
                "text-[16px] font-extrabold tracking-wide uppercase",
                ended ? "text-ink-soft" : "text-brand-strong",
              )}
            >
              {title}
            </span>
            <Badge tone={ended ? "neutral" : "reel"}>{deadlineLabel}</Badge>
          </span>

          {description && (
            <span className="mt-1.5 block text-[13.5px] leading-relaxed font-medium text-ink-soft">
              {description}
            </span>
          )}
        </span>

        {/* The stats that make the card worth collapsing — enough to decide
            whether to open it, without opening it. They sit on the chevron's
            side so the eye reads title and description down one edge and the
            numbers down the other.

            `order-last w-full` drops them onto their own row below the title
            on a phone, where three columns would leave the description a
            two-word ribbon. */}
        <span className="order-last flex w-full flex-col gap-0.5 text-[12.5px] font-bold text-ink-soft sm:order-none sm:w-auto sm:shrink-0 sm:items-end">
          <span className={cn(allDone ? "text-ok" : "text-bad")}>
              {allDone ? "All done" : "Done"} {doneCount}/{taskCount}
            </span>
          <span className="flex items-center gap-2">
            {/* Red is the point of the whole summary row: it is what makes an
                unfinished campaign findable without opening a single card. */}
            
            <span aria-hidden className="text-gray-300">
              ·
            </span>
            {/* Only points that have actually been credited get called
                "gained". Before anything lands, the same slot advertises what
                the campaign is worth instead of reading "+0 points gained". */}
            <span className="text-brand-strong">
              {earnedPoints > 0
                ? `+${earnedPoints} points gained`
                : `+${points} points to earn`}
            </span>
          </span>
        </span>

        <span
          aria-hidden
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 transition-transform duration-300 ease-out",
            open && "rotate-180",
          )}
        >
          <ChevronDown className="size-4.5" />
        </span>
      </button>

      {/* Height is animated with grid-template-rows 0fr → 1fr rather than a
          max-height guess: the row resolves to the content's real height, so
          a two-task campaign and a six-task one both take the same 300ms and
          neither snaps at the end.

          The body stays mounted so closing animates too — `inert` keeps it
          out of the tab order and the accessibility tree while it is shut. */}
      <div
        id={bodyId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "transition-opacity duration-200",
              open ? "opacity-100 delay-100" : "opacity-0",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}
