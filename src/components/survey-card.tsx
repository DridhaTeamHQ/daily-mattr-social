"use client";

import * as React from "react";
import { ChevronDown, ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SurveyCard({
  id,
  title,
  clicks,
  responses,
  children,
}: {
  id: string;
  title: string;
  clicks: number;
  responses: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const bodyId = `survey-${id}-body`;
  const shared = clicks > 0;
  const answered = responses > 0;

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
            <span className="text-[16px] font-extrabold tracking-wide text-ink uppercase">{title}</span>
            <Badge tone={shared ? "poll" : "neutral"}>{shared ? "Shared" : "Not shared yet"}</Badge>
          </span>
        </span>
        <span className="order-last flex w-full flex-col gap-0.5 text-[12.5px] font-bold text-ink-soft sm:order-none sm:w-auto sm:shrink-0 sm:items-end">
          <span className="text-ink">{clicks} {clicks === 1 ? "click" : "clicks"}</span>
          <span className={cn(answered ? "text-ok" : "text-bad")}>
            {responses} {responses === 1 ? "response" : "responses"}
          </span>
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
