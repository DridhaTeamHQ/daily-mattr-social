"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import * as React from "react";
import { CheckCircle2, Flame, Info, Lock, Trophy } from "lucide-react";

import { CountUp, useCelebration } from "@/components/celebrate";
import { MilestoneLevel } from "@/components/milestone-runner";
import { cn, formatNumber } from "@/lib/utils";

const STAGES = [
  { at: 0, name: "Started" },
  { at: 50, name: "Halfway" },
  { at: 80, name: "Stipend line" },
  { at: 100, name: "Perfect month" },
];

function stageFor(pct: number) {
  let current = STAGES[0];

  for (const stage of STAGES) {
    if (pct >= stage.at) current = stage;
  }

  return current;
}

/**
 * The "i" badge on each hero card.
 *
 * Four big numbers with no explanation is four questions a student has to ask
 * someone. Opens on hover — and on keyboard focus, which is the same gesture
 * for anyone tabbing rather than pointing.
 */
function InfoBadge({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip.Provider delayDuration={80} skipDelayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={`What is ${label}?`}
            className="tap grid size-6 shrink-0 place-items-center rounded-full border border-gray-200 bg-white text-gray-400 transition-colors outline-none hover:border-brand/35 hover:bg-brand-tint hover:text-brand-strong focus-visible:border-brand/35 focus-visible:bg-brand-tint focus-visible:text-brand-strong"
          >
            <Info className="size-3.5" />
          </button>
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            className="animate-rise z-50 w-[min(18rem,calc(100vw-1.5rem))] rounded-md border border-line bg-surface p-4 shadow-pop"
          >
            <p className="text-[11px] font-extrabold tracking-wider text-gray-500 uppercase">
              {label}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed font-medium text-ink-soft">
              {text}
            </p>

            <Tooltip.Arrow className="fill-surface" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function ProgressHero({
  rank,
  total,
  streak,
  completionPct,
  approvedTasks,
  totalTasks,
  stipendThresholdPct,
  celebrate = false,
}: {
  rank: number | null;
  total: number;
  streak: number;
  completionPct: number;
  approvedTasks: number;
  totalTasks: number;
  stipendThresholdPct: number;
  celebrate?: boolean;
}) {
  const fireConfetti = useCelebration();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (celebrate && !fired.current) {
      fired.current = true;
      const t = setTimeout(fireConfetti, 420);
      return () => clearTimeout(t);
    }
  }, [celebrate, fireConfetti]);

  const ranked = rank !== null && totalTasks > 0;
  const eligible = totalTasks > 0 && completionPct >= stipendThresholdPct;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
              Task Completion
            </span>
            <div className="size-8 rounded-lg bg-brand-tint border border-brand/20 flex items-center justify-center text-brand-strong">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-3xl font-black tracking-tight text-black">
                <CountUp value={completionPct} />%
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-gray-500">
                This month's approved-task rate
              </p>
            </div>
            <InfoBadge
              label="Task Completion"
              text="Your approved tasks divided by the total tasks assigned this month. Reach the stipend line to qualify."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
              Approved Tasks
            </span>
            <div className="size-8 rounded-lg bg-brand-strong flex items-center justify-center text-white">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-3xl font-black text-black tracking-tight">
                {formatNumber(approvedTasks)}/{formatNumber(totalTasks)}
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-gray-500">
                {totalTasks > 0
                  ? "Tasks approved this month"
                  : "No tasks assigned yet"}
              </p>
            </div>
            <InfoBadge
              label="Approved Tasks"
              text="Only approved or auto-approved tasks count toward your monthly completion percentage."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
              Completion Rank
            </span>
            <div className="size-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700">
              <Trophy className="size-4 text-brand-strong" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-3xl font-black text-black tracking-tight">
                {ranked ? `#${rank}` : "-"}
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-gray-500">
                {ranked ? `Out of ${total} ambassadors` : "Complete an active task to join the ranking"}
              </p>
            </div>
            <InfoBadge
              label="Completion Rank"
              text="Your position among ambassadors, ordered by approved-task completion percentage."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
              Daily Streak
            </span>
            <div className="size-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
              <Flame className="size-4 fill-current" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-3xl font-black text-black tracking-tight">
                {streak} {streak === 1 ? "day" : "days"}
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-gray-500">
                Active streak
              </p>
            </div>
            <InfoBadge
              label="Daily Streak"
              text="Tracks how many days in a row you've logged in. Missing a day resets the streak."
            />
          </div>
        </div>
      </div>

      <MilestoneLevel
        pct={completionPct}
        targetPct={stipendThresholdPct}
        approvedTasks={approvedTasks}
        totalTasks={totalTasks}
        eligible={eligible}
      />
    </div>
  );
}

export function TierTrack({
  completionPct,
  thresholdPct,
}: {
  completionPct: number;
  thresholdPct: number;
}) {
  const current = stageFor(completionPct);

  return (
    <ul className="flex gap-2 overflow-x-auto pb-4 pt-1 no-scrollbar">
      {STAGES.map((stage) => {
        const reached = completionPct >= stage.at;
        const isCurrent = stage === current;
        const stipendStage = stage.at === thresholdPct;

        return (
          <li key={stage.name} className="shrink-0">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold whitespace-nowrap transition-colors",
                isCurrent
                  ? "border-red-200 bg-yellow-50 text-ink"
                  : reached
                    ? "border-gray-200 bg-white text-ink"
                    : "border-gray-100 bg-gray-50 text-gray-500",
              )}
            >
              {reached ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <Lock className="size-3.5 text-gray-400" />
              )}
              {stage.name}
              <span
                className={cn(
                  "tabular ml-1",
                  isCurrent ? "text-ink" : reached ? "text-gray-500" : "text-gray-400",
                )}
              >
                {formatNumber(stage.at)}%
              </span>
              {stipendStage && (
                <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] text-brand-strong">
                  stipend
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
