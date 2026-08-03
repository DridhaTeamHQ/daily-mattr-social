import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Clapperboard,
  ClipboardList,
  Gift,
  Zap,
} from "lucide-react";

import { PointsHero, TierTrack } from "@/components/points-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { getDashboard } from "@/lib/queries";
import { cn, formatDate, formatDelta, timeRemaining } from "@/lib/utils";

export const metadata = { title: "Home" };

const LEDGER_LABELS: Record<string, string> = {
  survey_response: "Survey response",
  instagram_task: "Instagram task",
  referral: "Referral",
  manual_adjust: "Adjustment",
  revoke: "Reversed",
};

export default async function DashboardPage() {
  const data = await getDashboard();
  if (!data) redirect("/login");

  const { standing, campaigns, surveys, referrals, recentLedger, streak } = data;

  const openTasks = campaigns
    .flatMap((c) => c.tasks)
    .filter((t) => t.submission_status === null).length;

  const surveyResponses = surveys.reduce((n, s) => n + s.valid_responses, 0);

  // Confetti when an approval has landed that they haven't opened yet.
  const justApproved = data.notifications.some(
    (n) => n.type === "submission_approved" && !n.read_at,
  );

  return (
    <div className="space-y-7">
      <PointsHero
        points={standing.points}
        rank={standing.position > 0 ? standing.position : null}
        total={standing.total}
        streak={streak}
        celebrate={justApproved}
      />

      <TierTrack points={standing.points} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Open tasks"
          value={openTasks}
          sub={openTasks === 0 ? "All caught up" : "Waiting on you"}
          icon={Clapperboard}
          tone="reel"
        />
        <Stat
          label="Survey responses"
          value={surveyResponses}
          sub={`Across ${surveys.length} ${surveys.length === 1 ? "survey" : "surveys"}`}
          icon={ClipboardList}
          tone="poll"
        />
        <Stat
          label="Referrals"
          value={referrals.total_confirmed}
          sub={
            referrals.last_conversion
              ? `Last on ${formatDate(referrals.last_conversion)}`
              : "None yet"
          }
          icon={Gift}
          tone="invite"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* ─── Campaigns ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Campaigns"
          href="/dashboard/campaigns"
          linkLabel="See all"
          tone="reel"
        />

        {campaigns.length === 0 ? (
          <Card>
            <EmptyState
              icon={Clapperboard}
              title="No live campaigns"
              description="When the team publishes a reel, it shows up here with the tasks you can complete."
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {campaigns.slice(0, 2).map((c) => {
              const done = c.tasks.filter(
                (t) =>
                  t.submission_status === "approved" ||
                  t.submission_status === "auto_approved",
              ).length;
              const up = c.tasks.reduce((n, t) => n + t.points, 0);
              const pct = Math.round((done / Math.max(1, c.tasks.length)) * 100);

              return (
                <li key={c.id}>
                  <Card interactive className="overflow-hidden">
                    <CardBody className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[16px] font-bold text-ink">
                            {c.title}
                          </h3>
                          <Badge
                            tone={
                              timeRemaining(c.ends_at) === "Ended"
                                ? "neutral"
                                : "reel"
                            }
                          >
                            {timeRemaining(c.ends_at)}
                          </Badge>
                        </div>

                        {c.description && (
                          <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-ink-soft">
                            {c.description}
                          </p>
                        )}

                        <div className="mt-3.5 flex items-center gap-2.5">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas-sunk">
                            <div
                              className="h-full rounded-full bg-reel transition-[width] duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[12.5px] font-semibold text-ink-soft">
                            {done}/{c.tasks.length}
                          </span>
                        </div>

                        <p className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-reel">
                          <Zap className="size-3.5" />
                          {up} points up for grabs
                        </p>
                      </div>

                      <Button size="sm" variant="secondary" asChild>
                        <Link href={`/dashboard/campaigns#${c.id}`}>Open</Link>
                      </Button>
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ─── Recent activity ───────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Recent points" />

        <Card>
          {recentLedger.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              description="Complete a task or share a survey link and your points will appear here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {recentLedger.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-4 px-5 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink">
                      {entry.note ?? LEDGER_LABELS[entry.reason] ?? entry.reason}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-soft">
                      {LEDGER_LABELS[entry.reason] ?? entry.reason} ·{" "}
                      {formatDate(entry.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "tabular shrink-0 rounded-full px-2.5 py-1 text-[13.5px] font-extrabold",
                      entry.delta < 0
                        ? "bg-bad-tint text-bad"
                        : "bg-ok-tint text-ok",
                    )}
                  >
                    {formatDelta(entry.delta)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

const ACCENT_BAR: Record<string, string> = {
  reel: "bg-reel",
  poll: "bg-poll",
  invite: "bg-invite",
  brand: "bg-brand",
};

function SectionHeader({
  title,
  href,
  linkLabel,
  tone = "brand",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  tone?: keyof typeof ACCENT_BAR;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-2 text-[13px] font-extrabold tracking-wide text-ink-soft uppercase">
        <span
          aria-hidden
          className={cn("h-4 w-1.5 rounded-full", ACCENT_BAR[tone])}
        />
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-[13px] font-bold text-brand hover:text-brand-hover"
        >
          {linkLabel}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
