import Link from "next/link";
import {
  BadgeIndianRupee,
  CircleAlert,
  Download,
  Users,
  Wallet,
} from "lucide-react";

import { PayoutQueue } from "@/components/payout-queue";
import { AmbassadorNav } from "@/components/ambassador-nav";
import { ActionButton } from "@/components/action-button";
import { SearchBox } from "@/components/search-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { ProgressBar, Stat } from "@/components/ui/stat";
import { buildStipendBatch } from "@/lib/admin/money-actions";
import {
  getStipendPeriod,
  monthLabel,
  monthStart,
  recentMonths,
} from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/queries";
import { matches } from "@/lib/search";
import { cn, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Stipend" };

/**
 * The Stipend Eligibility Tracker.
 *
 * The threshold is two numbers ANDed together — 30 downloads and 3 surveys —
 * so the useful view is not a list of who passed but a list of who is close
 * and which half they are short on. Someone on 29 downloads and 5 surveys
 * needs one nudge; someone on 40 downloads and 0 surveys needs a different
 * one entirely, and a single "not met" badge would hide that difference.
 */
export default async function StipendPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; q?: string }>;
}) {
  await requireAdmin();

  const { month: monthParam, q } = await searchParams;
  const months = recentMonths(6);
  const month =
    monthParam && months.includes(monthParam) ? monthParam : monthStart(new Date());

  const period = await getStipendPeriod(month);
  const query = q ?? "";
  const rows = period.rows.filter((r) =>
    matches(query, r.full_name, r.city, r.batch),
  );

  const { thresholds, totals } = period;
  const isCurrent = month === monthStart(new Date());

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[24px] leading-none text-ink">
            Stipend &amp; payouts
          </h1>
          <p className="mt-2 text-[13px] font-semibold text-ink-soft">
            {thresholds.downloads} downloads and {thresholds.surveys} surveys of{" "}
            {thresholds.responsesPerSurvey}+ responses earns ₹
            {formatNumber(thresholds.amountInr)}, plus ₹
            {formatNumber(thresholds.bonusInr)} per extra{" "}
            {thresholds.bonusPerDownloads} downloads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AmbassadorNav />
          <Button variant="secondary" size="sm" asChild>
            <a href={`/admin/stipend/export?month=${month}`}>
              <Download aria-hidden />
              Export report
            </a>
          </Button>
        </div>
      </div>

      {/* ─── Month picker ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {months.map((m) => (
          <Link
            key={m}
            href={`/admin/stipend?month=${m}`}
            className={cn(
              "brut-sm rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold transition-transform",
              "hover:-translate-x-px hover:-translate-y-px",
              m === month ? "bg-brand text-white" : "bg-surface text-ink",
            )}
          >
            {monthLabel(m)}
          </Link>
        ))}
      </div>

      {/* ─── Headline ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Eligible"
          value={totals.eligible}
          sub={`of ${totals.cohort} active`}
          icon={BadgeIndianRupee}
          tone="rank"
        />
        <Stat
          label={isCurrent ? "At risk" : "Fell short"}
          value={isCurrent ? totals.atRisk : totals.notMet + totals.atRisk}
          sub={isCurrent ? "Started but not there yet" : "Missed the threshold"}
          icon={CircleAlert}
          tone="invite"
        />
        <Stat
          label="Still to pay"
          value={`₹${formatNumber(totals.projectedCostInr)}`}
          sub="Qualified, not yet batched"
          icon={Wallet}
          tone="brand"
        />
        <Stat
          label="Gone quiet"
          value={totals.inactive}
          sub={`Under ${thresholds.activeDays} of the last ${thresholds.activityWindow} days`}
          icon={CircleAlert}
          tone="reel"
        />
        <Stat
          label="Already paid"
          value={`₹${formatNumber(totals.alreadyPaidInr)}`}
          sub="This month"
          icon={Users}
          tone="rank"
        />
      </div>

      {totals.eligible > 0 && totals.projectedCostInr > 0 && (
        <Note tone="ok" title={`${totals.eligible} ambassadors qualified`}>
          Building a batch queues ₹{formatNumber(totals.projectedCostInr)} for
          the ones not already in one. Nobody is paid until you mark the payout
          paid with a reference.
          <div className="mt-3">
            <ActionButton
              size="sm"
              action={buildStipendBatch.bind(null, month)}
              confirmMessage={`Create a stipend batch for ${monthLabel(month)}?`}
            >
              Build payout batch
            </ActionButton>
          </div>
        </Note>
      )}

      {/* ─── The list ──────────────────────────────────────────────────────── */}
      <SearchBox placeholder="Find by name, city or batch…" />

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={BadgeIndianRupee}
            title={query ? "Nobody matches that" : "No active ambassadors"}
            description={
              query
                ? "Try a different name, city or batch."
                : "Add ambassadors before tracking stipends."
            }
          />
        ) : (
          <ul className="divide-y-[3px] divide-ink">
            {rows.map((row) => {
              const dlPct = Math.min(
                100,
                Math.round((row.downloads / thresholds.downloads) * 100),
              );
              // Against qualifying surveys, not touched ones: three links
              // with one response each is not three surveys, and a bar that
              // said it was would be telling an admin somebody is nearly there
              // when they have not started.
              const svPct = Math.min(
                100,
                Math.round((row.qualifyingSurveys / thresholds.surveys) * 100),
              );

              return (
                <li key={row.ambassador_id} className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      aria-hidden
                      className="brut-sm grid size-9 shrink-0 place-items-center rounded-full bg-canvas-sunk text-[11.5px] font-extrabold text-ink"
                    >
                      {initials(row.full_name)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/ambassadors/${row.ambassador_id}`}
                        className="truncate text-[14px] font-extrabold text-ink underline decoration-[3px] underline-offset-4 hover:decoration-brand"
                      >
                        {row.full_name}
                      </Link>
                      <p className="truncate text-[12px] text-ink-soft">
                        {[row.city, row.batch].filter(Boolean).join(" · ") ||
                          "No city or batch set"}
                      </p>
                    </div>

                    {/* Attendance is its own fact. Somebody can be on track
                        for the month and still have stopped opening the app,
                        and that is the version worth catching early. */}
                    {row.inactive && (
                      <Badge tone="bad" dot>
                        {row.activeDays}/{thresholds.activityWindow} days
                      </Badge>
                    )}
                    {row.paid && <Badge tone="neutral">in a batch</Badge>}
                    {row.met ? (
                      <Badge tone="ok" dot>
                        eligible
                      </Badge>
                    ) : row.at_risk ? (
                      <Badge tone="warn" dot>
                        at risk
                      </Badge>
                    ) : (
                      <Badge tone="neutral">not met</Badge>
                    )}
                    {row.bonusInr > 0 && (
                      <Badge tone="ok">+₹{formatNumber(row.bonusInr)} bonus</Badge>
                    )}
                  </div>

                  {/* Both bars always, even when one is complete — the gap is
                      the actionable part, and hiding a finished bar makes the
                      two rows impossible to compare down the column. */}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="flex items-baseline justify-between text-[12px] font-bold">
                        <span className="text-ink-soft">Downloads</span>
                        <span
                          className={cn(
                            "tabular",
                            row.downloads >= thresholds.downloads
                              ? "text-ok"
                              : "text-ink",
                          )}
                        >
                          {row.downloads}/{thresholds.downloads}
                        </span>
                      </div>
                      <ProgressBar
                        value={dlPct}
                        max={100}
                        tone={row.downloads >= thresholds.downloads ? "ok" : "invite"}
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between text-[12px] font-bold">
                        <span className="text-ink-soft">
                          Surveys with {thresholds.responsesPerSurvey}+
                        </span>
                        <span
                          className={cn(
                            "tabular",
                            row.qualifyingSurveys >= thresholds.surveys
                              ? "text-ok"
                              : "text-ink",
                          )}
                        >
                          {row.qualifyingSurveys}/{thresholds.surveys}
                        </span>
                      </div>
                      <ProgressBar
                        value={svPct}
                        max={100}
                        tone={
                          row.qualifyingSurveys >= thresholds.surveys
                            ? "ok"
                            : "poll"
                        }
                        className="mt-1.5"
                      />
                      {/* The gap between the two is the coaching note: links
                          shared, responses not collected. */}
                      {row.surveys > row.qualifyingSurveys && (
                        <p className="mt-1 text-[11.5px] font-semibold text-ink-faint">
                          {row.surveys - row.qualifyingSurveys} more started but
                          under {thresholds.responsesPerSurvey} responses
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Redemption decisions and payout batches used to be their own page.
          Both are money leaving the programme, and keeping them here means
          building a stipend batch and paying it are not two destinations. */}
      <PayoutQueue />
    </div>
  );
}
