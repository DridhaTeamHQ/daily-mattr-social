"use client";

import * as React from "react";
import { Flame, Star, Trophy, Zap } from "lucide-react";

import { CountUp, useCelebration } from "@/components/celebrate";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Milestones. Deliberately close together at the bottom — the first one has to
 * be reachable in a single afternoon or it isn't a goal, it's a wall.
 */
export const TIERS = [
  { at: 0, name: "Rookie", fill: "bg-surface" },
  { at: 100, name: "Warmed up", fill: "bg-poll-tint" },
  { at: 300, name: "Regular", fill: "bg-rank-tint" },
  { at: 750, name: "Campus star", fill: "bg-invite-tint" },
  { at: 1500, name: "Legend", fill: "bg-reel-tint" },
  { at: 3000, name: "Hall of fame", fill: "bg-brand" },
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

export function PointsHero({
  points,
  rank,
  total,
  streak,
  /** Fire confetti on mount — set when an approval landed since last visit. */
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
      // Let the count-up get going first, so the confetti lands with the
      // number rather than before it means anything.
      const t = setTimeout(fireConfetti, 420);
      return () => clearTimeout(t);
    }
  }, [celebrate, fireConfetti]);

  const { current, next } = tierFor(points);
  const span = next ? next.at - current.at : 0;
  const into = next ? points - current.at : 0;
  const pct = next ? Math.min(100, Math.round((into / span) * 100)) : 100;

  return (
    <div className="brut-lg relative rounded-lg bg-brand p-5 sm:p-7">
      {/* Sticker badges, tilted just enough to look applied rather than
          laid out. Absolute on desktop, inline on phones where there is no
          room to float anything. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 sm:absolute sm:top-5 sm:right-6 sm:mb-0 sm:flex-col sm:items-end">
        <span className="sticker inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-extrabold text-ink">
          <Star className="size-3.5" fill="currentColor" />
          {current.name}
        </span>

        {streak > 0 && (
          <span className="sticker sticker-r inline-flex items-center gap-1.5 rounded-full bg-flame-tint px-3 py-1.5 text-[12.5px] font-extrabold text-ink">
            <Flame className="size-3.5 text-flame" fill="currentColor" />
            {streak} day{streak === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <p className="text-[13px] font-extrabold tracking-widest text-ink uppercase">
        Your points
      </p>

      <CountUp
        value={points}
        className="display tabular block text-[68px] leading-[0.9] text-ink sm:text-[92px]"
      />

      {rank !== null && total > 0 && (
        <span className="brut-sm mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[13px] font-extrabold text-ink">
          <Trophy className="size-4" />
          Rank #{rank} of {total}
        </span>
      )}

      {/* Progress to the next tier. The number that matters is "how many
          more", not the percentage — nobody grinds toward 62%. */}
      {next && (
        <div className="mt-5 max-w-md">
          <div className="flex items-baseline justify-between text-[12.5px] font-extrabold text-ink uppercase">
            <span>Next: {next.name}</span>
            <span className="inline-flex items-center gap-1">
              <Zap className="size-3.5" fill="currentColor" />
              {formatNumber(next.at - points)} to go
            </span>
          </div>

          <div className="mt-2 h-5 overflow-hidden rounded-full border-[3px] border-ink bg-surface">
            <div
              className={cn(
                "h-full bg-reel transition-[width] duration-700 ease-out",
                pct > 0 && pct < 100 && "border-r-[3px] border-ink",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Tier chips, shown under the hero as something to aim at. */
export function TierTrack({ points }: { points: number }) {
  return (
    <ul className="flex gap-2 overflow-x-auto pb-2">
      {TIERS.map((tier) => {
        const reached = points >= tier.at;
        return (
          <li key={tier.name} className="shrink-0">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border-[3px] border-ink px-3 py-1.5 text-[12.5px] font-extrabold whitespace-nowrap",
                reached
                  ? cn("text-ink shadow-[3px_3px_0_var(--color-ink)]", tier.fill)
                  : "bg-surface text-ink-faint opacity-60",
              )}
            >
              {reached && <Star className="size-3.5" fill="currentColor" />}
              {tier.name}
              <span className="tabular opacity-70">
                {formatNumber(tier.at)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
