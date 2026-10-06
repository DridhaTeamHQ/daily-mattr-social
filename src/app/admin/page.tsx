import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  ClipboardList,
  Gift,
  Inbox,
  RotateCcw,
  Settings2,
  Users,
  XCircle,
} from "lucide-react";

import { ProgrammeVersionCard } from "@/components/programme-version-card";
import { Card, CardBody } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { getOverview, getRecentActivity } from "@/lib/admin/queries";
import { getViewingScope } from "@/lib/programme-version";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Overview" };

const ACTION_LABELS: Record<string, string> = {
  "submission.approve": "approved a screenshot",
  "submission.reject": "rejected a screenshot",
  "submission.revoke": "revoked an approval",
  "ambassador.status": "changed an ambassador's status",
  "ambassador.invite": "invited an ambassador",
  "ambassador.segments": "updated ambassador groups",
  "points.adjust": "updated an ambassador record",
  "points.referral": "credited referral points",
  "referral.set_count": "corrected a download count",
  "campaign.status": "changed a campaign's status",
  "campaign.create": "created a campaign",
  "campaign.delete": "deleted a campaign",
  "campaign.remind": "nudged the ambassadors who hadn't started",
  "campaign.schedule": "scheduled a campaign",
  "campaign.unschedule": "cancelled a campaign's schedule",
  "survey.status": "changed a survey's status",
  "survey.links": "issued survey links",
  "survey.create": "built a survey",
  "survey.delete": "deleted a survey",
  "survey.schedule": "scheduled a survey",
  "survey.unschedule": "cancelled a survey's schedule",
  "ambassador.create": "added an ambassador",
  "ambassador.reset_password": "reset an ambassador's password",
  "programme.version_start": "started a new run of the programme",
  "programme.version_activate": "changed which run is current",
  "settings.referral_link_unlock": "changed when referral links unlock",
  "settings.stipend_unlock": "changed when the stipend unlocks",
};

/**
 * The icon and colour for a log entry, by what kind of thing happened —
 * so a column of approvals reads as a column of green ticks, and the one
 * rejection in it stands out without being read.
 */
function actionStyle(action: string): {
  icon: React.ComponentType<{ className?: string }>;
  className: string;
} {
  if (action === "submission.approve") return { icon: CheckCircle2, className: "bg-emerald-50 text-emerald-600" };
  if (action === "submission.reject" || action === "submission.revoke")
    return { icon: XCircle, className: "bg-rose-50 text-rose-600" };
  if (action.endsWith(".schedule") || action.endsWith(".unschedule"))
    return { icon: CalendarClock, className: "bg-amber-50 text-amber-600" };
  if (action.startsWith("campaign.")) return { icon: Clapperboard, className: "bg-violet-50 text-violet-600" };
  if (action.startsWith("survey.")) return { icon: ClipboardList, className: "bg-teal-50 text-teal-600" };
  if (action.startsWith("ambassador.")) return { icon: Users, className: "bg-sky-50 text-sky-600" };
  if (action.startsWith("points.") || action.startsWith("referral."))
    return { icon: Gift, className: "bg-fuchsia-50 text-fuchsia-600" };
  if (action.startsWith("programme.")) return { icon: RotateCcw, className: "bg-gray-100 text-ink-soft" };
  return { icon: Settings2, className: "bg-gray-100 text-ink-soft" };
}

/** "just now", "12m ago", "3h ago", "2d ago" — then the date. */
function ago(at: string): string {
  const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(at);
}

export default async function AdminOverviewPage() {
  const [overview, activity, scope] = await Promise.all([
    getOverview(),
    getRecentActivity(10),
    getViewingScope(),
  ]);

  const queue = overview.queue.pending + overview.queue.needsReview;

  return (
    <div className="stagger space-y-6">
      <div>
        <h1 className="display text-[26px] leading-none text-ink">
          Overview
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          What needs your attention, and how {scope.label} is doing.
        </p>
      </div>

      {/* The queue is the whole job, so it gets a banner rather than a tile:
          warm when there is work, green when there is none. */}
      <section
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4",
          queue > 0
            ? "border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50"
            : "border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50",
        )}
      >
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-sm",
            queue > 0
              ? "bg-gradient-to-br from-amber-400 to-orange-500"
              : "bg-gradient-to-br from-emerald-400 to-teal-500",
          )}
        >
          {queue > 0 ? <Inbox className="size-5" /> : <CheckCircle2 className="size-5" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold text-ink">
            {queue > 0
              ? `${queue} ${queue === 1 ? "submission" : "submissions"} waiting on you`
              : "Review queue is clear"}
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-soft">
            {queue > 0
              ? `${overview.queue.needsReview} flagged for a human · ${overview.queue.pending} still being checked`
              : "Nothing is waiting. New uploads appear here automatically."}
          </p>
        </div>

        <Link
          href="/admin/review"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors",
            queue > 0 ? "bg-orange-500 hover:bg-orange-600" : "bg-emerald-600 hover:bg-emerald-700",
          )}
        >
          Open queue
          <ArrowRight className="size-3.5" />
        </Link>
      </section>

      {/* Each tile opens the page behind its number. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/admin/ambassadors" className="block">
          <Stat
            label="Active ambassadors"
            value={overview.ambassadors.active}
            sub={`${overview.ambassadors.invited} invited · ${overview.ambassadors.suspended} suspended`}
            icon={Users}
            tone="brand"
            interactive
            className="h-full"
          />
        </Link>
        <Link href="/admin/review" className="block">
          <Stat
            label="Pending review"
            value={queue}
            sub="Awaiting a decision"
            icon={Inbox}
            tone="rank"
            interactive
            className="h-full"
          />
        </Link>
        <Link href="/admin/surveys" className="block">
          <Stat
            label="Survey responses"
            value={overview.responses}
            sub={`${overview.surveys.live} live surveys`}
            icon={ClipboardList}
            tone="poll"
            interactive
            className="h-full"
          />
        </Link>
        <Link href="/admin/referrals" className="block">
          <Stat
            label="Installs"
            value={overview.referrals}
            sub="Confirmed downloads"
            icon={Gift}
            tone="invite"
            interactive
            className="h-full"
          />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ─── Programme state ──────────────────────────────────────────── */}
        <div className="space-y-3 lg:col-span-2">
          <h2 className="text-[15px] font-extrabold text-ink">Programme state</h2>

          <StateCard
            icon={Clapperboard}
            label="Campaigns"
            href="/admin/campaigns"
            tile="from-violet-500 to-indigo-600"
            counts={[
              { label: "Live", value: overview.campaigns.live, dot: "bg-emerald-500" },
              { label: "Draft", value: overview.campaigns.draft, dot: "bg-amber-400" },
              { label: "Ended", value: overview.campaigns.ended, dot: "bg-gray-300" },
            ]}
          />
          <StateCard
            icon={ClipboardList}
            label="Surveys"
            href="/admin/surveys"
            tile="from-teal-400 to-cyan-600"
            counts={[
              { label: "Live", value: overview.surveys.live, dot: "bg-emerald-500" },
              { label: "Draft", value: overview.surveys.draft, dot: "bg-amber-400" },
              { label: "Closed", value: overview.surveys.closed, dot: "bg-gray-300" },
            ]}
          />
          <StateCard
            icon={Users}
            label="Ambassadors"
            href="/admin/ambassadors"
            tile="from-sky-400 to-blue-600"
            counts={[
              { label: "Active", value: overview.ambassadors.active, dot: "bg-emerald-500" },
              { label: "Invited", value: overview.ambassadors.invited, dot: "bg-amber-400" },
              { label: "Suspended", value: overview.ambassadors.suspended, dot: "bg-rose-500" },
            ]}
          />
        </div>

        {/* ─── Activity ─────────────────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardBody>
            <h2 className="text-[15px] font-extrabold text-ink">
              Recent admin activity
            </h2>

            {activity.length === 0 ? (
              <p className="mt-4 text-[13px] text-ink-soft">
                Nothing yet. Approvals, invites and point adjustments are
                recorded here.
              </p>
            ) : (
              <ul className="mt-3">
                {activity.map((entry, index) => {
                  const style = actionStyle(entry.action);
                  const Icon = style.icon;
                  const name = entry.profiles?.full_name ?? "Someone";
                  return (
                    <li key={entry.id} className="relative flex gap-3 pb-3 last:pb-0">
                      {/* The thread between entries, so the list reads as a
                          timeline rather than a table. */}
                      {index < activity.length - 1 && (
                        <span
                          aria-hidden
                          className="absolute top-9 bottom-0 left-[17px] w-px bg-gray-200"
                        />
                      )}
                      <span
                        className={cn(
                          "relative grid size-9 shrink-0 place-items-center rounded-full",
                          style.className,
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 pt-1.5">
                        <p className="text-[13px] text-ink">
                          <span className="font-bold" title={name}>
                            {name}
                          </span>{" "}
                          <span className="text-ink-soft">
                            {ACTION_LABELS[entry.action] ?? entry.action}
                          </span>
                        </p>
                      </div>
                      {/* Relative, with the exact time on hover: "3h ago"
                          answers "is this today's work" at a glance. */}
                      <span
                        className="shrink-0 pt-1.5 text-[11.5px] font-semibold whitespace-nowrap text-ink-faint"
                        title={formatDate(entry.created_at, true)}
                      >
                        {ago(entry.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Last on the page, deliberately. Starting a new run is the rarest
          thing an admin does here and the one with the widest effect, so it
          sits below the day's work rather than beside it. */}
      <ProgrammeVersionCard versions={scope.versions} viewing={scope.version} />
    </div>
  );
}

/**
 * One part of the programme — campaigns, surveys, ambassadors — as a small
 * card: a coloured tile, the name, and its counts by state side by side.
 * The whole card opens that section.
 */
function StateCard({
  icon: Icon,
  label,
  href,
  tile,
  counts,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  /** Tailwind gradient stops for the tile. */
  tile: string;
  counts: { label: string; value: number; dot: string }[];
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-surface p-4 shadow-xs transition-shadow hover:shadow-md"
    >
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm",
          tile,
        )}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-extrabold text-ink">{label}</p>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {counts.map((c) => (
            <li key={c.label} className="flex items-center gap-1.5 text-[12px]">
              <span aria-hidden className={cn("size-2 rounded-full", c.dot)} />
              <span className="tabular font-extrabold text-ink">{c.value}</span>
              <span className="text-ink-soft">{c.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <ChevronRight
        className="size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
        aria-hidden
      />
    </Link>
  );
}
