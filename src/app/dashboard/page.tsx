import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Clapperboard,
  ClipboardList,
  Gift,
  Zap,
} from "lucide-react";

import { LevelUpWatcher } from "@/components/level-up";
import { PointsHero, TierTrack } from "@/components/points-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ProgressBar, Stat } from "@/components/ui/stat";
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
    <div className="stagger space-y-7">
      <LevelUpWatcher points={standing.points} />

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
          label="Responses"
          value={surveyResponses}
          sub={`${surveys.length} ${surveys.length === 1 ? "survey" : "surveys"}`}
          icon={ClipboardList}
          tone="poll"
        />
        <Stat
          label="Referrals"
          value={referrals.total_confirmed}
          sub={
            referrals.last_conversion
              ? `Last ${formatDate(referrals.last_conversion)}`
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
          fill="bg-reel"
        />

        {campaigns.length === 0 ? (
          <Card>
            <EmptyState
              icon={Clapperboard}
              title="No live campaigns"
              description="When the team drops a reel, it lands here with the tasks you can complete."
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
              const ended = timeRemaining(c.ends_at) === "Ended";

              return (
                <li key={c.id}>
                  <Card interactive>
                    <CardBody className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="display text-[17px] text-ink">
                            {c.title}
                          </h3>
                          <Badge tone={ended ? "neutral" : "reel"}>
                            {timeRemaining(c.ends_at)}
                          </Badge>
                        </div>

                        {c.description && (
                          <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed font-medium text-ink-soft">
                            {c.description}
                          </p>
                        )}

                        <div className="mt-3.5 flex items-center gap-3">
                          <ProgressBar
                            value={done}
                            max={c.tasks.length}
                            tone="reel"
                            className="flex-1"
                          />
                          <span className="shrink-0 text-[12.5px] font-extrabold text-ink">
                            {done}/{c.tasks.length}
                          </span>
                        </div>

                        <p className="brut-sm mt-3 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[12px] font-extrabold text-ink">
                          <Zap className="size-3.5" fill="currentColor" />
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
        <SectionHeader title="Recent points" fill="bg-brand" />

        <Card>
          {recentLedger.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              description="Finish a task or share a survey link and your points show up here."
            />
          ) : (
            <ul className="divide-y-[3px] divide-ink">
              {recentLedger.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-4 px-5 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-extrabold text-ink">
                      {entry.note ?? LEDGER_LABELS[entry.reason] ?? entry.reason}
                    </p>
                    <p className="mt-0.5 text-[12px] font-semibold text-ink-soft">
                      {LEDGER_LABELS[entry.reason] ?? entry.reason} ·{" "}
                      {formatDate(entry.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "tabular brut-sm shrink-0 rounded-full px-2.5 py-1 text-[13.5px] font-extrabold text-ink",
                      entry.delta < 0 ? "bg-bad-tint" : "bg-ok-tint",
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

function SectionHeader({
  title,
  href,
  linkLabel,
  fill = "bg-brand",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  fill?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      {/* The heading is a filled outlined block, not a label — it anchors the
          section the way a poster headline does. */}
      <h2
        className={cn(
          "brut-sm display rounded-sm px-3 py-1 text-[13px] text-ink",
          fill,
        )}
      >
        {title}
      </h2>

      {href && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-[13px] font-extrabold text-ink underline decoration-[3px] underline-offset-4 hover:decoration-reel"
        >
          {linkLabel}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
