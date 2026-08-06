"use client";

import * as React from "react";
import { Flame, Lock, Star, Trophy, Zap } from "lucide-react";

import { CountUp, useCelebration } from "@/components/celebrate";
import { MilestoneProgress } from "@/components/milestone-runner";
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
}export function PointsHero({
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
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
              Total Points
            </span>
            <div className="size-8 rounded-lg bg-brand-tint border border-brand/20 flex items-center justify-center text-brand-strong">
              <Zap className="size-4 fill-current" />
            </div>
          </div>
          <div>
            <CountUp
              value={points}
              className="text-3xl font-black text-black tracking-tight"
            />
            <p className="text-xs font-semibold text-gray-500 mt-0.5">Active Balance</p>
          </div>
        </div>

        {/* Card 2: Current Tier */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
              Current Tier
            </span>
            <div className="size-8 rounded-lg bg-brand-strong flex items-center justify-center text-white">
              <Star className="size-4 fill-current text-amber-300" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black text-black tracking-tight">
              {current.name}
            </h3>
            <p className="text-xs font-semibold text-brand-strong mt-0.5">Unlocked Member</p>
          </div>
        </div>

        {/* Card 3: Leaderboard Rank */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
              Leaderboard Rank
            </span>
            <div className="size-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700">
              <Trophy className="size-4 text-brand-strong" />
            </div>
          </div>
          <div>
            <h3 className="text-3xl font-black text-black tracking-tight">
              #{rank !== null ? rank : "-"}
            </h3>
            <p className="text-xs font-semibold text-gray-500 mt-0.5">
              Out of {total} Ambassadors
            </p>
          </div>
        </div>

        {/* Card 4: Daily Streak */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
              Daily Streak
            </span>
            <div className="size-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
              <Flame className="size-4 fill-current" />
            </div>
          </div>
          <div>
            <h3 className="text-3xl font-black text-black tracking-tight">
              {streak} Days
            </h3>
            <p className="text-xs font-semibold text-red-500 mt-0.5">Active Streak</p>
          </div>
        </div>
      </div>

      {/* Bottom Progress Card - Large & Prominent */}
      {next && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-7 shadow-xs space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm sm:text-base font-bold">
            <div className="flex items-center gap-2.5">
              <span className="size-3 rounded-full bg-brand-strong animate-pulse" />
              <span className="text-gray-700">Next Milestone: <strong className="text-black font-black">{next.name}</strong> <span className="text-xs text-gray-500 font-semibold">({next.at} pts)</span></span>
            </div>
            <span className="text-brand-strong font-black text-sm sm:text-base">
              {formatNumber(next.at - points)} pts needed ({pct}%)
            </span>
          </div>

          <MilestoneProgress pct={pct} />
        </div>
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
                  ? "border-yellow-200 bg-yellow-50 text-ink"
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
