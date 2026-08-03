import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  ClipboardList,
  Coins,
  Gift,
  Inbox,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { getOverview, getRecentActivity } from "@/lib/admin/queries";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata = { title: "Overview" };

const ACTION_LABELS: Record<string, string> = {
  "submission.approve": "approved a screenshot",
  "submission.reject": "rejected a screenshot",
  "submission.revoke": "revoked an approval",
  "ambassador.status": "changed an ambassador's status",
  "ambassador.invite": "invited an ambassador",
  "points.adjust": "adjusted points",
  "campaign.status": "changed a campaign's status",
  "campaign.create": "created a campaign",
  "survey.status": "changed a survey's status",
  "survey.links": "issued survey links",
  "survey.create": "built a survey",
  "ambassador.create": "added an ambassador",
  "ambassador.reset_password": "reset an ambassador's password",
};

export default async function AdminOverviewPage() {
  const [overview, activity] = await Promise.all([
    getOverview(),
    getRecentActivity(10),
  ]);

  const queue = overview.queue.pending + overview.queue.needsReview;

  return (
    <div className="stagger space-y-7">
      <div>
        <h1 className="display text-[26px] leading-none text-ink">
          Overview
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          What needs your attention, and how the programme is doing.
        </p>
      </div>

      {/* The queue is the whole job, so it gets a banner rather than a tile. */}
      <Card
        className={
          queue > 0
            ? "border-warn-line bg-warn-tint"
            : "border-ok-line bg-ok-tint"
        }
      >
        <CardBody className="flex flex-wrap items-center gap-4">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-md ${
              queue > 0 ? "bg-warn/15 text-warn" : "bg-ok/15 text-ok"
            }`}
          >
            <Inbox className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">
              {queue > 0
                ? `${queue} ${queue === 1 ? "submission" : "submissions"} waiting on you`
                : "Review queue is clear"}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              {queue > 0
                ? `${overview.queue.needsReview} flagged for a human · ${overview.queue.pending} still being checked`
                : "Nothing is waiting. New uploads appear here automatically."}
            </p>
          </div>

          <Link
            href="/admin/review"
            className="inline-flex items-center gap-1.5 rounded-sm bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-ink/85"
          >
            Open queue
            <ArrowRight className="size-3.5" />
          </Link>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Active ambassadors"
          value={overview.ambassadors.active}
          sub={`${overview.ambassadors.invited} invited · ${overview.ambassadors.suspended} suspended`}
          icon={Users}
          tone="brand"
        />
        <Stat
          label="Points issued"
          value={overview.points.issued}
          sub={
            overview.points.revoked < 0
              ? `${formatNumber(Math.abs(overview.points.revoked))} reversed`
              : "Nothing reversed"
          }
          icon={Coins}
          tone="rank"
        />
        <Stat
          label="Survey responses"
          value={overview.responses}
          sub={`${overview.surveys.live} live · ${overview.surveys.draft} draft`}
          icon={ClipboardList}
          tone="poll"
        />
        <Stat
          label="Referrals"
          value={overview.referrals}
          sub="Confirmed downloads"
          icon={Gift}
          tone="invite"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ─── Programme state ──────────────────────────────────────────── */}
        <Card>
          <CardBody>
            <h2 className="text-[15px] font-semibold text-ink">
              Programme state
            </h2>

            <dl className="mt-4 space-y-3">
              <StateRow
                icon={Clapperboard}
                label="Campaigns"
                tone="reel"
                counts={[
                  { label: "live", value: overview.campaigns.live, tone: "ok" },
                  { label: "draft", value: overview.campaigns.draft, tone: "neutral" },
                  { label: "ended", value: overview.campaigns.ended, tone: "neutral" },
                ]}
                href="/admin/campaigns"
              />
              <StateRow
                icon={ClipboardList}
                label="Surveys"
                tone="poll"
                counts={[
                  { label: "live", value: overview.surveys.live, tone: "ok" },
                  { label: "draft", value: overview.surveys.draft, tone: "neutral" },
                  { label: "closed", value: overview.surveys.closed, tone: "neutral" },
                ]}
                href="/admin/surveys"
              />
              <StateRow
                icon={Users}
                label="Ambassadors"
                tone="brand"
                counts={[
                  { label: "active", value: overview.ambassadors.active, tone: "ok" },
                  { label: "invited", value: overview.ambassadors.invited, tone: "warn" },
                  {
                    label: "suspended",
                    value: overview.ambassadors.suspended,
                    tone: "bad",
                  },
                ]}
                href="/admin/ambassadors"
              />
            </dl>
          </CardBody>
        </Card>

        {/* ─── Activity ─────────────────────────────────────────────────── */}
        <Card>
          <CardBody>
            <h2 className="text-[15px] font-semibold text-ink">
              Recent admin activity
            </h2>

            {activity.length === 0 ? (
              <p className="mt-4 text-[13px] text-ink-soft">
                Nothing yet. Approvals, invites and point adjustments are
                recorded here.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-baseline gap-2 py-2.5">
                    <span className="min-w-0 flex-1 text-[13px] text-ink">
                      <span className="font-medium">
                        {entry.profiles?.full_name ?? "Someone"}
                      </span>{" "}
                      <span className="text-ink-soft">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] text-ink-faint">
                      {formatDate(entry.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function StateRow({
  icon: Icon,
  label,
  tone,
  counts,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "brand" | "reel" | "poll";
  counts: { label: string; value: number; tone: "ok" | "warn" | "bad" | "neutral" }[];
  href: string;
}) {
  const chip = {
    brand: "bg-brand-tint text-brand",
    reel: "bg-reel-tint text-reel",
    poll: "bg-poll-tint text-poll",
  }[tone];

  return (
    <div className="flex items-center gap-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-xs ${chip}`}>
        <Icon className="size-4" />
      </span>

      <dt className="w-28 shrink-0 text-[13.5px] font-medium text-ink">
        <Link href={href} className="hover:text-brand">
          {label}
        </Link>
      </dt>

      <dd className="flex flex-wrap gap-1.5">
        {counts.map((c) => (
          <Badge key={c.label} tone={c.value > 0 ? c.tone : "neutral"}>
            {c.value} {c.label}
          </Badge>
        ))}
      </dd>
    </div>
  );
}
