import { redirect } from "next/navigation";
import { Coins, History } from "lucide-react";

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

export const metadata = { title: "Points & rewards" };

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

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={Coins}
        tone="brand"
        title="Points & rewards"
        description="Everything you've earned, and every badge you've unlocked."
        variant="outline"
        className="border-gray-200 bg-gray-50"
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Balance"
          value={formatNumber(rewards.balance)}
          sub="Points you hold"
          icon={Coins}
          tone="brand"
        />
        <Stat
          label="Earned"
          value={formatNumber(rewards.lifetimeEarned)}
          sub="All time"
          icon={History}
          tone="poll"
        />
      </div>

      {/* ─── Requests ──────────────────────────────────────────────────────── */}
      {rewards.requests.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="display text-[16px] text-ink">Your requests</h2>
            <ul className="mt-3 divide-y divide-gray-100">
              {rewards.requests.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-ink">
                      ₹{formatNumber(Number(r.amount_inr))} ·{" "}
                      {formatNumber(r.points)} points
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

      {/* The terms sit above the badges: a student on this page is asking
          what their effort is worth, and the badges answer a smaller version
          of that question than the stipend does. */}
      <ProgrammeTerms
        terms={stipend.thresholds}
        progress={
          stipend.current
            ? {
                downloads: stipend.current.downloads,
                qualifyingSurveys: stipend.current.qualifyingSurveys,
                activeDays: stipend.activeDays,
                bonusInr: stipend.current.bonusInr,
                totalInr: stipend.current.totalInr,
                met: stipend.current.met,
              }
            : undefined
        }
      />

      <BadgeWall badges={badges} />

      {/* ─── The ledger ────────────────────────────────────────────────────── */}
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
