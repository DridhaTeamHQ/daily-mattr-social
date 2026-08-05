import {
  Award,
  BadgeIndianRupee,
  ClipboardCheck,
  Compass,
  Flame,
  Gift,
  Lock,
  Zap,
} from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import type { BadgeView } from "@/lib/badges";
import { cn, formatDate } from "@/lib/utils";

/**
 * The badge wall.
 *
 * Locked badges are shown alongside earned ones, greyed and with their
 * criteria still readable. That is the whole mechanic: a shelf of things you
 * have not got yet is what makes the ones you have got mean something, and
 * hiding them turns every unlock into a surprise nobody was working towards.
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "clipboard-check": ClipboardCheck,
  gift: Gift,
  compass: Compass,
  zap: Zap,
  flame: Flame,
  "badge-indian-rupee": BadgeIndianRupee,
  award: Award,
};

const TONES: Record<string, string> = {
  brand: "bg-blue-50 text-blue-600",
  poll: "bg-sky-50 text-sky-600",
  reel: "bg-rose-50 text-rose-600",
  invite: "bg-amber-50 text-amber-600",
  rank: "bg-emerald-50 text-emerald-600",
};

export function BadgeWall({ badges }: { badges: BadgeView[] }) {
  if (badges.length === 0) return null;

  const earned = badges.filter((b) => b.awardedAt).length;

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-[16px] text-ink">Badges</h2>
          <span className="text-[12.5px] font-bold text-ink-soft">
            {earned} of {badges.length} unlocked
          </span>
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {badges.map((badge) => {
            const Icon = ICONS[badge.icon] ?? Award;
            const unlocked = Boolean(badge.awardedAt);

            return (
              <li
                key={badge.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3.5 transition-colors",
                  unlocked
                    ? "border-gray-200 bg-white"
                    : "border-dashed border-gray-200 bg-gray-50",
                )}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    unlocked
                      ? (TONES[badge.tone] ?? TONES.brand)
                      : "bg-gray-100 text-gray-400",
                  )}
                >
                  {unlocked ? (
                    <Icon className="size-5" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-[14px] font-extrabold",
                      unlocked ? "text-ink" : "text-ink-soft",
                    )}
                  >
                    {badge.label}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed font-semibold text-ink-soft">
                    {badge.description}
                  </p>
                  {unlocked && badge.awardedAt && (
                    <p className="mt-1 text-[11.5px] font-bold text-emerald-600">
                      Earned {formatDate(badge.awardedAt)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
