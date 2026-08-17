import Link from "next/link";
import {
  BadgeIndianRupee,
  CircleAlert,
  Download,
  Users,
  Wallet,
} from "lucide-react";

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
            Track approved tasks and monthly stipend status.
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
          sub={isCurrent ? "Completion in progress" : "Did not qualify"}
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
              const approvalsNeeded = row.totalTasks
                ? Math.max(
                    0,
                    Math.ceil((thresholds.completionPct / 100) * row.totalTasks) -
                      row.approvedTasks,
                  )
                : 0;

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
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                    <div>
                      <div className="flex items-baseline justify-between text-[12px] font-bold">
                        <span className="text-ink-soft">Completion</span>
                        <span
                          className={cn(
                            "tabular",
                            row.completionPct >= thresholds.completionPct
                              ? "text-ok"
                              : "text-ink",
                          )}
                        >
                          {formatNumber(row.completionPct)}%
                        </span>
                      </div>
                      <ProgressBar
                        value={row.completionPct}
                        max={100}
                        tone={
                          row.completionPct >= thresholds.completionPct ? "ok" : "invite"
                        }
                        className="mt-1.5"
                      />
                      {row.totalTasks > 0 ? (
                        <p className="mt-1 text-[11.5px] font-semibold text-ink-faint">
                          {row.met
                            ? "Completion recorded."
                            : `${formatNumber(approvalsNeeded)} more approval${approvalsNeeded === 1 ? "" : "s"} needed.`}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11.5px] font-semibold text-ink-faint">
                          No campaign tasks landed in this month.
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-soft">
                        Approved tasks
                      </p>
                      <p className="mt-1 text-[22px] font-black text-ink">
                        {formatNumber(row.approvedTasks)}/{formatNumber(row.totalTasks)}
                      </p>
                      <p className="mt-1 text-[11.5px] font-semibold text-ink-faint">
                        Tasks approved out of the ones assigned this month
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

    </div>
  );
}
