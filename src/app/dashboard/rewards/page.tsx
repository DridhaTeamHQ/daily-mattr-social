import { redirect } from "next/navigation";
import { BadgeIndianRupee, CheckCircle2, Coins, Wallet } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { BadgeWall } from "@/components/badge-wall";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { getMyBadges } from "@/lib/badges";
import { getRewards, getStipendProgress } from "@/lib/rewards";
import { ProgrammeTerms } from "@/components/programme-terms";
import { cn, formatDate, formatNumber } from "@/lib/utils";

export const metadata = { title: "Your rewards" };

const REASON_LABEL: Record<string, string> = {
  survey_response: "Survey response",
  instagram_task: "Campaign task",
  referral: "App download",
  manual_adjust: "Adjustment",
  revoke: "Reversed",
};

const STATUS_TONE = {
  requested: "warn",
  approved: "ok",
  rejected: "bad",
  paid: "ok",
} as const;

export default async function RewardsPage() {
  const [rewards, badges, stipend] = await Promise.all([
    getRewards(),
    getMyBadges(),
    getStipendProgress(),
  ]);
  if (!rewards) redirect("/login?next=/dashboard/rewards");

  const month = stipend.current;
  const met = month?.met ?? false;

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={Coins}
        tone="brand"
        title="Your rewards"
        description="Everything you've earned, and every badge you've unlocked."
        variant="outline"
        className="border-gray-200 bg-gray-50"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Total points"
          value={formatNumber(rewards.balance)}
          sub="Points you hold"
          icon={Coins}
          tone="brand"
        />
        <Stat
          label="Completion"
          value={`${formatNumber(month?.completionPct ?? 0)}%`}
          sub={
            month?.totalTasks
              ? `${formatNumber(month.approvedTasks)}/${formatNumber(month.totalTasks)} tasks approved`
              : "No tasks assigned this month"
          }
          icon={CheckCircle2}
          tone="rank"
        />
        <Stat
          label="Approved tasks"
          value={
            month
              ? `${formatNumber(month.approvedTasks)}/${formatNumber(month.totalTasks)}`
              : "0/0"
          }
          sub={`Stipend unlocks at ${formatNumber(stipend.thresholds.completionPct)}%`}
          icon={Wallet}
          tone="poll"
        />
        <Stat
          label="Stipend"
          value={met ? `₹${formatNumber(stipend.thresholds.amountInr)}` : "—"}
          sub={
            met
              ? "Completion line cleared"
              : `Above ${formatNumber(stipend.thresholds.completionPct)}% earns the stipend`
          }
          icon={BadgeIndianRupee}
          tone="invite"
        />
      </div>

      {rewards.requests.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="display text-[16px] text-ink">Your requests</h2>
            <ul className="mt-3 divide-y divide-gray-100">
              {rewards.requests.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-ink">
                      ₹{formatNumber(Number(r.amount_inr))} · {formatNumber(r.points)} points
                    </p>
                    <p className="truncate text-[12px] text-ink-soft">
                      {formatDate(r.requested_at)}
                      {r.decision_note ? ` · ${r.decision_note}` : ""}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[r.status]} dot>
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <ProgrammeTerms
        terms={stipend.thresholds}
        progress={
          stipend.current
            ? {
                completionPct: stipend.current.completionPct,
                approvedTasks: stipend.current.approvedTasks,
                totalTasks: stipend.current.totalTasks,
                activeDays: stipend.activeDays,
                totalInr: stipend.current.totalInr,
                met: stipend.current.met,
              }
            : undefined
        }
      />

      <BadgeWall badges={badges} />

      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Points history</h2>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
            Every point, where it came from, and when. Reversals stay on the
            record beside what they reversed.
          </p>

          {rewards.ledger.length === 0 ? (
            <EmptyState
              icon={Coins}
              title="Nothing yet"
              description="Complete a task or share a survey to get started."
            />
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {rewards.ledger.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink">
                      {entry.note || REASON_LABEL[entry.reason] || entry.reason}
                    </p>
                    <p className="text-[12px] text-ink-soft">
                      {REASON_LABEL[entry.reason] ?? entry.reason} ·{" "}
                      {formatDate(entry.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "tabular shrink-0 text-[14px] font-extrabold",
                      entry.delta >= 0 ? "text-ok" : "text-bad",
                    )}
                  >
                    {entry.delta >= 0 ? "+" : "−"}
                    {formatNumber(Math.abs(entry.delta))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
