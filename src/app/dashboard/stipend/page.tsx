import { redirect } from "next/navigation";
import { BadgeIndianRupee, Download, ClipboardList } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { ProgressBar } from "@/components/ui/stat";
import { getStipendProgress } from "@/lib/rewards";
import { getUser } from "@/lib/supabase/server";
import { cn, formatNumber } from "@/lib/utils";

export const metadata = { title: "Stipend" };

const PAID_TONE = {
  paid: "ok",
  pending: "warn",
  processing: "warn",
  failed: "bad",
} as const;

export default async function StipendProgressPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/dashboard/stipend");

  const { thresholds, current, history } = await getStipendProgress();

  const dlLeft = current ? Math.max(0, thresholds.downloads - current.downloads) : thresholds.downloads;
  const svLeft = current ? Math.max(0, thresholds.surveys - current.surveys) : thresholds.surveys;

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={BadgeIndianRupee}
        tone="brand"
        title="Stipend"
        description={`${thresholds.downloads} downloads and ${thresholds.surveys} surveys in a month earns ₹${formatNumber(thresholds.amountInr)}.`}
        variant="outline"
        className="border-gray-200 bg-gray-50"
      />

      {/* ─── This month ────────────────────────────────────────────────────── */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="display text-[17px] text-ink">
              {current?.label ?? "This month"}
            </h2>
            {current?.met ? (
              <Badge tone="ok" dot>
                earned
              </Badge>
            ) : (
              <Badge tone="neutral">in progress</Badge>
            )}
            {current && current.paidStatus !== "none" && (
              <Badge tone={PAID_TONE[current.paidStatus as keyof typeof PAID_TONE] ?? "neutral"}>
                {current.paidStatus}
              </Badge>
            )}
          </div>

          {/* Both bars, always. You need BOTH to qualify, so hiding the one
              you have finished would make it look like the other is optional. */}
          <div className="mt-4 space-y-4">
            <Bar
              icon={Download}
              label="Downloads"
              value={current?.downloads ?? 0}
              target={thresholds.downloads}
              tone="invite"
            />
            <Bar
              icon={ClipboardList}
              label="Survey responses"
              value={current?.surveys ?? 0}
              target={thresholds.surveys}
              tone="poll"
            />
          </div>

          {current?.met ? (
            <Note tone="ok" title="You&apos;ve qualified" className="mt-4">
              You&apos;ve hit both targets for {current.label}. The payout goes out
              in this month&apos;s batch.
            </Note>
          ) : (
            <Note tone="brand" title="What's left" className="mt-4">
              {dlLeft > 0 && svLeft > 0 ? (
                <>
                  {dlLeft} more download{dlLeft === 1 ? "" : "s"} and {svLeft}{" "}
                  more survey response{svLeft === 1 ? "" : "s"}.
                </>
              ) : dlLeft > 0 ? (
                <>
                  Surveys are done. {dlLeft} more download
                  {dlLeft === 1 ? "" : "s"} to go.
                </>
              ) : (
                <>
                  Downloads are done. {svLeft} more survey response
                  {svLeft === 1 ? "" : "s"} to go.
                </>
              )}
            </Note>
          )}
        </CardBody>
      </Card>

      {/* ─── History ───────────────────────────────────────────────────────── */}
      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Past months</h2>

          {history.length === 0 ? (
            <EmptyState
              icon={BadgeIndianRupee}
              title="No history yet"
              description="Your first full month will show up here."
            />
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {history.map((month) => (
                <li key={month.period} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-ink">
                      {month.label}
                    </p>
                    <p className="text-[12px] text-ink-soft">
                      {month.downloads}/{thresholds.downloads} downloads ·{" "}
                      {month.surveys}/{thresholds.surveys} surveys
                    </p>
                  </div>

                  {month.paidStatus === "paid" ? (
                    <Badge tone="ok" dot>
                      paid
                    </Badge>
                  ) : month.met ? (
                    <Badge tone="warn" dot>
                      earned
                    </Badge>
                  ) : (
                    <Badge tone="neutral">missed</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Bar({
  icon: Icon,
  label,
  value,
  target,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  target: number;
  tone: "invite" | "poll";
}) {
  const done = value >= target;
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-ink-soft" />
        <span className="text-[13px] font-bold text-ink">{label}</span>
        <span
          className={cn(
            "tabular ml-auto text-[13px] font-extrabold",
            done ? "text-ok" : "text-ink",
          )}
        >
          {value}/{target}
        </span>
      </div>
      <ProgressBar
        value={pct}
        max={100}
        tone={done ? "ok" : tone}
        className="mt-2"
      />
    </div>
  );
}
