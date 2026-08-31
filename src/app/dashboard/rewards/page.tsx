import { redirect } from "next/navigation";
import { BadgeIndianRupee, CheckCircle2, Trophy } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { getDashboard, getMyAchievements } from "@/lib/queries";
import { getStipendProgress } from "@/lib/rewards";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata = { title: "Reward Structure" };

export default async function RewardsPage() {
  const [dashboard, stipend, achievements] = await Promise.all([
    getDashboard(),
    getStipendProgress(),
    getMyAchievements(),
  ]);
  if (!dashboard) redirect("/login?next=/dashboard/rewards");

  const month = stipend.current;
  const met = month?.met ?? false;

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={BadgeIndianRupee}
        tone="brand"
        title="Reward Structure"
        description="Your monthly stipend is based on approved-task completion."
        variant="outline"
        className="border-gray-200 bg-gray-50"
      />

      {/* Two tiles, no captions. The approved/total count was on all three of
          them — as the headline of one and the caption of another — and the
          panel below repeats it a third time as the formula it feeds. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat
          label="Completion"
          value={`${formatNumber(month?.completionPct ?? 0)}%`}
          icon={CheckCircle2}
          tone="rank"
        />
        <Stat
          label="Stipend"
          value={met ? `Rs ${formatNumber(stipend.thresholds.amountInr)}` : "-"}
          icon={BadgeIndianRupee}
          tone="invite"
        />
      </div>

      {/* ─── Achievements ──────────────────────────────────────────────────
          Always on the page, empty or not. Hidden-until-populated meant a
          student who had earned nothing yet could not tell the section existed
          — and neither could anyone checking whether the feature works. */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="display text-[16px] text-ink">Achievements</h2>
              <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
                Recognition from the dailymattr team.
              </p>
            </div>
            <Trophy className="size-5 shrink-0 text-rank" />
          </div>

          {achievements.length === 0 ? (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-canvas-sunk px-4 py-3.5">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-ink-faint"
              >
                <Trophy className="size-4" />
              </span>
              <p className="text-[13px] leading-relaxed font-semibold text-ink-soft">
                Nothing here yet. The team adds these by hand for the work a
                number cannot show — running a stall, helping somebody else
                finish, turning up when it counted.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {achievements.map((achievement) => (
                <li
                  key={achievement.id}
                  className="flex items-start gap-3 rounded-xl bg-rank-tint/50 px-4 py-3"
                >
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-rank"
                  >
                    <Trophy className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-extrabold text-ink">
                      {achievement.title}
                    </p>
                    {achievement.note && (
                      <p className="mt-0.5 text-[12.5px] leading-relaxed font-medium text-ink-soft">
                        {achievement.note}
                      </p>
                    )}
                    <p className="mt-0.5 text-[12px] font-semibold text-ink-faint">
                      {formatDate(achievement.awarded_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
