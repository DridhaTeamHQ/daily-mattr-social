"use client";

import * as React from "react";
import { Flame, Sparkles, Trophy } from "lucide-react";

import { CountUp, useCelebration } from "@/components/celebrate";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Milestones. Deliberately close together at the bottom — the first one has to
 * be reachable in a single afternoon or it isn't a goal, it's a wall.
 */
const TIERS = [
  { at: 0, name: "Rookie" },
  { at: 100, name: "Getting going" },
  { at: 300, name: "Regular" },
  { at: 750, name: "Campus star" },
  { at: 1500, name: "Legend" },
  { at: 3000, name: "Hall of fame" },
];

function tierFor(points: number) {
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
    <div className="bg-brand-gradient relative overflow-hidden rounded-lg px-5 py-6 text-white shadow-glow sm:px-8 sm:py-8">
      <div className="relative z-10">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-bold backdrop-blur-sm">
            <Sparkles className="size-3.5" />
            {current.name}
          </span>

          {streak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-bold backdrop-blur-sm">
              <Flame className="size-3.5" />
              {streak} day{streak === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <p className="mt-4 text-[13px] font-semibold text-white/70">
          Your points
        </p>
        <CountUp
          value={points}
          className="tabular block text-[64px] leading-[0.95] font-extrabold sm:text-[84px]"
        />

        {rank !== null && total > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[13px] backdrop-blur-sm">
            <Trophy className="size-3.5" />
            Rank <span className="font-extrabold">#{rank}</span> of {total}
          </p>
        )}

        {/* Progress to the next tier. The number that matters is "how many
            more", not the percentage — nobody grinds toward 62%. */}
        {next && (
          <div className="mt-5 max-w-sm">
            <div className="flex items-baseline justify-between text-[12.5px] font-semibold">
              <span className="text-white/75">Next: {next.name}</span>
              <span className="text-white">
                {formatNumber(next.at - points)} to go
              </span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Atmosphere only — nothing readable sits on these. */}
      <div
        aria-hidden
        className="animate-float pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-20 size-64 rounded-full bg-white/10 blur-3xl"
      />
    </div>
  );
}

/** Compact tier chips, shown under the hero as something to aim at. */
export function TierTrack({ points }: { points: number }) {
  return (
    <ul className="flex gap-2 overflow-x-auto pb-1">
      {TIERS.map((tier) => {
        const reached = points >= tier.at;
        return (
          <li key={tier.name} className="shrink-0">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap",
                reached
                  ? "border-brand-line bg-brand-tint text-brand-press"
                  : "border-line bg-surface text-ink-faint",
              )}
            >
              {reached && <Sparkles className="size-3.5" />}
              {tier.name}
              <span className="tabular font-semibold opacity-70">
                {formatNumber(tier.at)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
