"use client";

import * as React from "react";
import { ChevronDown, Megaphone, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CampaignCard({
  id,
  variant,
  title,
  description,
  deadlineLabel,
  ended,
  taskCount,
  doneCount,
  defaultOpen = false,
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
  /** Open on first render — the admin preview has nothing else to show. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const Icon = variant === "clip" ? Video : Megaphone;
  const bodyId = `campaign-${id}-body`;
  const allDone = taskCount > 0 && doneCount === taskCount;

  return (
    <Card id={id} className="scroll-mt-20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="tap flex w-full flex-wrap items-center gap-x-4 gap-y-3 p-6 text-left transition-colors hover:bg-canvas-sunk"
      >
        <span
          aria-hidden
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-xl",
            variant === "clip" ? "bg-brand-tint text-brand-strong" : "bg-gray-100 text-gray-800",
          )}
        >
          <Icon className="size-6" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn("text-[16px] font-extrabold tracking-wide uppercase", ended ? "text-ink-soft" : "text-brand-strong")}>
              {title}
            </span>
            {/* What kind of thing this is, in the same slot the survey card
                uses for the same purpose. Tasks and surveys sit in one list
                now, so the badge is what tells them apart. */}
            <Badge tone={ended ? "neutral" : "reel"}>Task</Badge>
            {/* The deadline only when there is one. "No deadline" was a chip
                that took up the same room as a real answer to say nothing. */}
            {deadlineLabel !== "No deadline" && (
              <Badge tone={ended ? "neutral" : "warn"}>{deadlineLabel}</Badge>
            )}
          </span>
          {description && (
            <span className="mt-1.5 block text-[13.5px] leading-relaxed font-medium text-ink-soft">
              {description}
            </span>
          )}
        </span>

        <span className="order-last flex w-full flex-col gap-0.5 text-[12.5px] font-bold text-ink-soft sm:order-none sm:w-auto sm:shrink-0 sm:items-end">
          <span className={cn(allDone ? "text-ok" : "text-bad")}>
            {allDone ? "All done" : "Done"} {doneCount}/{taskCount}
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

      <div
        id={bodyId}
        inert={!open}
        className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="overflow-hidden">
          <div className={cn("transition-opacity duration-200", open ? "opacity-100 delay-100" : "opacity-0")}>
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}
