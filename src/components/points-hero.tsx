"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import * as React from "react";
import { CheckCircle2, Flame, Info, Star, Trophy } from "lucide-react";

import { CountUp, useCelebration } from "@/components/celebrate";
import { MilestoneLevel } from "@/components/milestone-runner";

export const COMPLETION_TIERS = [
  { at: 0, name: "Rookie" },
  { at: 20, name: "Warmed up" },
  { at: 40, name: "Regular" },
  { at: 60, name: "Campus star" },
  { at: 80, name: "Legend" },
  { at: 100, name: "Hall of fame" },
];

export function completionTierFor(pct: number) {
  let current = COMPLETION_TIERS[0];
  let next: (typeof COMPLETION_TIERS)[number] | null = null;

  for (const tier of COMPLETION_TIERS) {
    if (pct >= tier.at) current = tier;
    else {
      next = tier;
      break;
    }
  }

  return { current, next };
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
  batch,
  streak,
  completionPct,
  totalTasks,
  celebrate = false,
}: {
  rank: number | null;
  total: number;
  /** The group the rank is out of. Null when it is the whole programme. */
  batch?: string | null;
  streak: number;
  completionPct: number;
  totalTasks: number;
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
  const { current, next } = completionTierFor(completionPct);

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
                Approved-task rate
              </p>
            </div>
            <InfoBadge
              label="Task Completion"
              text="Your approved tasks divided by the total tasks assigned this month."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
              Current Tier
            </span>
            {/* Tinted like the other three badges rather than filled solid
                blue: a block of brand colour in one tile pulled the eye to the
                tier before the completion number it is derived from. */}
            <div className="size-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500">
              <Star className="size-4 fill-current" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-3xl font-black text-black tracking-tight">
                {current.name}
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-gray-500">
                {totalTasks > 0 ? "Based on task completion" : "No tasks assigned yet"}
              </p>
            </div>
            <InfoBadge
              label="Current Tier"
              text="Your tier grows as your approved-task completion percentage increases."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
              Your Rank
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
                {ranked
                  ? batch
                    ? `Out of ${total} in ${batch}`
                    : `Out of ${total} ambassadors`
                  : "Complete an active task to join the ranking"}
              </p>
            </div>
            <InfoBadge
              label="Completion Rank"
              text={
                batch
                  ? `Your position within ${batch}, ordered by approved-task completion percentage. You are ranked against the people who started when you did, not the whole programme.`
                  : "Your position among ambassadors, ordered by approved-task completion percentage."
              }
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
                {streak === 0
                  ? "Open the app tomorrow to start one"
                  : "Days in a row you were active"}
              </p>
            </div>
            <InfoBadge
              label="Daily Streak"
              text="Days in a row you showed up. Signing in counts on its own, and so does uploading proof, getting a response through your survey link, bringing in a referral, or having points credited. Miss a whole day and it resets."
            />
          </div>
        </div>
      </div>

      {next && (
        <MilestoneLevel
          pct={completionPct}
          /* The tiers themselves are the coins: every one between the start
             and the flag sits at its own percentage with its name over it, so
             the track says what each stop is worth without a legend. */
          stops={COMPLETION_TIERS.filter((tier) => tier.at > 0 && tier.at < 100)}
          finish={COMPLETION_TIERS[COMPLETION_TIERS.length - 1].name}
          marks={COMPLETION_TIERS.map((tier) => tier.at)}
        />
      )}
    </div>
  );
}
