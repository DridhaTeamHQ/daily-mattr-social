"use client";

import * as React from "react";
import { ChevronDown, ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SurveyCard({
  id,
  title,
  responses,
  target,
  children,
}: {
  id: string;
  title: string;
  responses: number;
  /** Responses that finish this survey — the programme threshold. */
  target: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const bodyId = `survey-${id}-body`;
  const done = responses >= target;

  return (
    <Card id={id} className="scroll-mt-20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="tap flex w-full flex-wrap items-center gap-x-4 gap-y-3 p-6 text-left transition-colors hover:bg-canvas-sunk"
      >
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-poll-tint text-poll">
          <ClipboardList className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            {/* Same treatment as a campaign title — the two sit in one list on
                Tasks, and a black title next to a blue one reads as a
                different kind of thing rather than the same thing. */}
            <span className="text-[16px] font-extrabold tracking-wide text-brand-strong uppercase">{title}</span>
            {/* "Shared" said what the click count beside it already says. The
                badge now answers the question the list actually raises: is
                this a task or a survey. */}
            <Badge tone="poll">Survey</Badge>
          </span>
        </span>
        {/* Worded like a campaign's "All done 2/2", because it means the same
            thing: this one is finished and there is nothing left to chase. */}
        <span className="order-last flex w-full flex-col gap-0.5 text-[12.5px] font-bold text-ink-soft sm:order-none sm:w-auto sm:shrink-0 sm:items-end">
          <span className={cn(done ? "text-ok" : "text-bad")}>
            {done ? "All done" : "Done"} {responses}/{target}
          </span>
          <span className="text-ink-soft">responses</span>
        </span>
        <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 transition-transform duration-300 ease-out", open && "rotate-180")}>
          <ChevronDown className="size-4.5" />
        </span>
      </button>

      <div id={bodyId} inert={!open} className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className={cn("transition-opacity duration-200", open ? "opacity-100 delay-100" : "opacity-0")}>
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}
