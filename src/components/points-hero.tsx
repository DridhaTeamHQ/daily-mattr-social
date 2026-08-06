"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import * as React from "react";
import { Flame, Info, Lock, Star, Trophy, Zap } from "lucide-react";

import { CountUp, useCelebration } from "@/components/celebrate";
import { MilestoneLevel } from "@/components/milestone-runner";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Milestones. Deliberately close together at the bottom — the first one has to
 * be reachable in a single afternoon or it isn't a goal, it's a wall.
 */
export const TIERS = [
  { at: 0, name: "Rookie", fill: "bg-surface" },
  { at: 100, name: "Warmed up", fill: "bg-brand-tint" },
  { at: 300, name: "Regular", fill: "bg-brand-tint border-brand/50" },
  { at: 750, name: "Campus star", fill: "bg-gray-50 text-ink-faint" },
  { at: 1500, name: "Legend", fill: "bg-gray-50 text-ink-faint" },
  { at: 3000, name: "Hall of fame", fill: "bg-gray-50 text-ink-faint" },
];

export function tierFor(points: number) {
  let current = TIERS[0];
  let next: (typeof TIERS)[number] | null = null;

  for (const tier of TIERS) {
    if (points >= tier.at) current = tier;
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
            // Hover and focus-visible carry the whole open state here, so
            // there is no data-[state] variant to keep in sync with them.
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

export function PointsHero({
  points,
  rank,
  total,
  streak,
  celebrate = false,
}: {
  points: number;
  rank: number | null;
  total: number;
  streak: number;
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

  // A position only means something once there are points behind it.
  const ranked = rank !== null && points > 0;

  const { current, next } = tierFor(points);
  const span = next ? next.at - current.at : 0;
  const into = next ? points - current.at : 0;
  const pct = next ? Math.min(100, Math.round((into / span) * 100)) : 100;

  return (
    <div className="space-y-4">
      {/* Top 4 Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Points */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
              Total Points
            </span>
            <div className="size-8 rounded-lg bg-brand-tint border border-brand/20 flex items-center justify-center text-brand-strong">
              <Zap className="size-4 fill-current" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <CountUp
                value={points}
                className="text-3xl font-black text-black tracking-tight"
              />
              <p className="text-xs font-semibold text-gray-500 mt-0.5">Active Balance</p>
            </div>
            <InfoBadge
              label="Total Points"
              text="The total points you've earned by completing campaigns, surveys, and other program activities. Earn more points to unlock higher tiers and improve your leaderboard rank."
            />
          </div>
        </div>

        {/* Card 2: Current Tier */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
              Current Tier
            </span>
            <div className="size-8 rounded-lg bg-brand-strong flex items-center justify-center text-white">
              <Star className="size-4 fill-current text-amber-300" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-2xl font-black text-black tracking-tight">
                {current.name}
              </h3>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">Unlocked Member</p>
            </div>
            <InfoBadge
              label="Current Tier"
              text="Your current ambassador level based on the points you've earned. Reach the required points to unlock the next tier and its rewards."
            />
          </div>
        </div>

        {/* Card 3: Leaderboard Rank */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">
              Leaderboard Rank
            </span>
            <div className="size-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700">
              <Trophy className="size-4 text-brand-strong" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              {/* Nobody on zero points has placed in anything, so the board
                  position they technically hold is noise — a dash says "not
                  started" where "#13" would read like a result. The `#` goes
                  with it; the old fallback rendered "#-". */}
              <h3 className="text-3xl font-black text-black tracking-tight">
                {ranked ? `#${rank}` : "-"}
              </h3>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">
                {ranked
                  ? `Out of ${total} Ambassadors`
                  : "Earn points to get ranked"}
              </p>
            </div>
            <InfoBadge
              label="Leaderboard Rank"
              text="Your position among all ambassadors based on total points. Complete more activities to climb the rankings."
            />
          </div>
        </div>

        {/* Card 4: Daily Streak */}
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
              <p className="text-xs font-semibold text-gray-500 mt-0.5">Active Streak</p>
            </div>
            <InfoBadge
              label="Daily Streak"
              text="Tracks how many days in a row you've logged in. Missing a day will reset your streak."
            />
          </div>
        </div>
      </div>

      {/* The one card on this page that is a place rather than a readout.
          Everything else is a number in a box; this is a level with somebody
          running across it, so it gets a sky, and the numbers on top of it
          get the hard drop shadow a game HUD uses to stay readable over
          scenery. */}
      {next && (
        <MilestoneLevel
          name={next.name}
          at={next.at}
          remaining={next.at - points}
          pct={pct}
        />
      )}
    </div>
  );
}

/** Tier chips, shown under the hero as something to aim at. */
export function TierTrack({ points }: { points: number }) {
  const { current } = tierFor(points);

  return (
    <ul className="flex gap-2 overflow-x-auto pb-4 pt-1 no-scrollbar">
      {TIERS.map((tier) => {
        const reached = points >= tier.at;
        const isCurrent = tier === current;

        return (
          <li key={tier.name} className="shrink-0">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold whitespace-nowrap transition-colors",
                isCurrent
                  ? "border-red-200 bg-yellow-50 text-ink"
                  : reached
                    ? "border-gray-200 bg-white text-ink"
                    : "border-gray-100 bg-gray-50 text-gray-500"
              )}
            >
              {reached ? <Star className="size-3.5" fill={isCurrent ? "currentColor" : "none"} /> : <Lock className="size-3.5 text-gray-400" />}
              {tier.name}
              <span className={cn("tabular ml-1", isCurrent ? "text-ink" : reached ? "text-gray-500" : "text-gray-400")}>
                {formatNumber(tier.at)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
