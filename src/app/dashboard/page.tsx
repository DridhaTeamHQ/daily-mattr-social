import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Clapperboard,
  ClipboardCheck,
  ClipboardList,
  Gift,
  Megaphone,
  TrendingDown,
  TrendingUp,
  Video,
  Zap,
} from "lucide-react";

import { LevelUpWatcher } from "@/components/level-up";
import { PointsHero, TierTrack } from "@/components/points-hero";
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

  const { profile, standing, campaigns, surveys, referrals, recentLedger, streak } =
    data;

  const openTasks = campaigns
    .flatMap((c) => c.tasks)
    .filter((t) => t.submission_status === null).length;

  const surveyResponses = surveys.reduce((n, s) => n + s.valid_responses, 0);

  // First name only. "Hii Bharani Kumar Reddy" is a form field, not a greeting.
  const firstName = (profile.full_name || "there").trim().split(/\s+/)[0];

  /**
   * Nothing on the record yet — no points, no submission, no response.
   *
   * Not "did they sign in before": that would need a stored flag, and it would
   * be wrong for the student who signs in three times before doing anything.
   * An empty ledger is the honest version of the question the greeting is
   * really asking, which is whether this screen has anything to show them.
   */
  const isNewcomer =
    standing.points === 0 &&
    recentLedger.length === 0 &&
    surveyResponses === 0 &&
    campaigns.every((c) => c.tasks.every((t) => t.submission_status === null));

  // Confetti when an approval has landed that they haven't opened yet.
  const justApproved = data.notifications.some(
    (n) => n.type === "submission_approved" && !n.read_at,
  );

  return (
    <div className="stagger space-y-7">
      <LevelUpWatcher points={standing.points} />

      {/* ─── Greeting ──────────────────────────────────────────────────────
          The four cards underneath are all numbers. This is the one line on
          the screen addressed to a person rather than a metric, so it gets to
          be the largest thing and the only place the brand blue is used on a
          name. */}
      <header>
        <h1 className="text-[28px] leading-tight font-black tracking-tight text-ink sm:text-[34px]">
          Hey <span className="text-brand-strong">{firstName}</span>
          <span
            aria-hidden
            className="animate-wiggle ml-1.5 inline-block origin-[70%_75%]"
          >
            👋
          </span>
        </h1>
        {/* Two lines, and the split is "have they done anything yet" rather
            than "is there work waiting". Somebody on their first visit has an
            empty screen behind this sentence, so it has to tell them where to
            start; everybody else already knows, and a count of open tasks in
            a greeting is a to-do list wearing a welcome. */}
        <p className="mt-1 text-[13.5px] font-semibold text-gray-500">
          {isNewcomer
            ? "Ready to make an impact? Complete your first task and start earning points."
            : "Welcome back! Ready to earn more points today?"}
        </p>
      </header>

      {/* ─── Progress ──────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Your progress" />

        <div className="space-y-7">
          <PointsHero
            points={standing.points}
            rank={standing.position > 0 ? standing.position : null}
            total={standing.total}
            streak={streak}
            celebrate={justApproved}
          />

          <TierTrack points={standing.points} />
        </div>
      </section>

      {/* ─── Tasks ─────────────────────────────────────────────────────────
          `interactive` off: these three read a number, they don't go anywhere.
          The chevron it draws promised a tap target that was never wired up. */}
      <section>
        <SectionHeader title="Your Tasks" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat
            label="Open tasks"
            value={openTasks}
            sub={openTasks === 0 ? "All caught up" : "Waiting for you"}
            icon={ClipboardCheck}
            tone="reel"
            interactive={false}
          />
          <Stat
            label="Responses"
            value={surveyResponses}
            sub={`${surveys.length} ${surveys.length === 1 ? "survey" : "surveys"}`}
            icon={ClipboardList}
            tone="poll"
            interactive={false}
          />
          <Stat
            label="Installs"
            value={referrals.total_confirmed}
            sub={
              referrals.last_conversion
                ? `Last ${formatDate(referrals.last_conversion)}`
                : "None yet"
            }
            icon={Gift}
            tone="invite"
            interactive={false}
          />
        </div>
      </section>

      {/* ─── Campaigns ─────────────────────────────────────────────────── */}
      
      
      
      {/* <section>
        <SectionHeader
          title="Campaigns"
          href="/dashboard/campaigns"
          linkLabel="See all"
        />

        {campaigns.length === 0 ? (
          <Card className="rounded-2xl border border-gray-200 shadow-sm">
            <EmptyState
              icon={Clapperboard}
              title="No live campaigns"
              description="When the team drops a reel, it lands here with the tasks you can complete."
            />
          </Card>
        ) : (
          <ul className="space-y-4">
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
                  <Card interactive className="rounded-2xl border-gray-200 shadow-sm overflow-hidden">
                    <CardBody className="flex flex-col sm:flex-row items-start gap-5 p-6 sm:p-7 relative">
                      
                      <Button size="sm" variant={ended ? "secondary" : "brand"} asChild className={cn(
                        "absolute top-6 right-6 z-20",
                        ended && "bg-white border border-gray-200 text-ink shadow-sm"
                      )}>
                        <Link href={`/dashboard/campaigns#${c.id}`}>Open</Link>
                      </Button>

                      <div className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-brand-strong text-white shadow-sm relative z-10">
                        {c.title.includes("CLIP") ? (
                          <Video className="size-6 text-white" />
                        ) : (
                          <Megaphone className="size-6 text-white" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 sm:pr-[240px] relative z-10">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-[15px] font-extrabold uppercase tracking-wide text-ink">
                            {c.title}
                          </h3>
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold",
                            ended ? "bg-green-50 text-green-700" : "bg-brand-tint text-brand-press"
                          )}>
                            {timeRemaining(c.ends_at)}
                          </span>
                        </div>

                        {c.description && (
                          <p className="mt-2 text-[14px] leading-relaxed font-medium text-gray-600 max-w-lg">
                            {c.description}
                          </p>
                        )}

                        <div className="mt-5 flex items-center gap-3 max-w-xl">
                          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                             <div className="h-full bg-ink rounded-full" style={{ width: `${(done / c.tasks.length) * 100}%` }} />
                          </div>
                          <span className="shrink-0 text-[13px] font-extrabold text-ink">
                            {done}/{c.tasks.length}
                          </span>
                        </div>

                        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-strong px-3 py-1.5 text-[12px] font-bold text-white shadow-sm">
                          <Zap className="size-3.5" fill="currentColor" />
                          {up} points up for grabs
                        </div>
                      </div>

                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section> */}

      {/* ─── Recent activity ───────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Recent Activity" />

        <Card className="rounded-2xl border-gray-200 shadow-sm overflow-hidden">
          {recentLedger.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              description="Finish a task or share a survey link and your points show up here."
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentLedger.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors"
                >
                  <span
                    className={cn(
                      "tabular rounded-full px-3 py-1 text-[13px] font-extrabold min-w-[50px] text-center",
                      entry.delta < 0 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700",
                    )}
                  >
                    {formatDelta(entry.delta)}
                  </span>
                  
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-extrabold text-ink">
                      {entry.note ?? LEDGER_LABELS[entry.reason] ?? entry.reason}
                    </p>
                    <p className="mt-0.5 text-[13px] font-medium text-gray-500">
                      {LEDGER_LABELS[entry.reason] ?? entry.reason} ·{" "}
                      {formatDate(entry.created_at)}
                    </p>
                  </div>
                  
                  <div className="shrink-0 flex items-center justify-center size-8 rounded-full border border-gray-100 bg-white shadow-sm">
                     {entry.delta < 0 ? (
                       <TrendingDown className="size-4 text-red-500" />
                     ) : (
                       <TrendingUp className="size-4 text-green-500" />
                     )}
                  </div>
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
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4 px-1">
      <h2 className="text-[14px] font-black uppercase tracking-widest text-black">
        {title}
      </h2>

      {href && (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-ink hover:text-brand-strong transition-colors"
        >
          {linkLabel}
          <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

