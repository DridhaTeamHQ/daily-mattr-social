import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Heart,
  MessageCircle,
  Percent,
  Play,
  Share2,
  Upload,
  Users,
} from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { CampaignEditDialog } from "@/components/edit-dialogs";
import { BarList, ChartCard, DataTable, DayBars } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { ProgressBar, Stat } from "@/components/ui/stat";
import { setCampaignStatus } from "@/lib/admin/actions";
import { archiveCampaign } from "@/lib/admin/edit-actions";
import { getCampaignDetail, requireAdmin } from "@/lib/admin/queries";
import { cn, formatDate, formatNumber, initials, timeRemaining } from "@/lib/utils";

export const metadata = { title: "Campaign" };

const STATUS_TONE = {
  live: "ok",
  draft: "neutral",
  ended: "neutral",
  archived: "neutral",
} as const;

const TASK_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  like: { label: "Like the reel", icon: Heart },
  comment: { label: "Leave a comment", icon: MessageCircle },
  share: { label: "Share it", icon: Share2 },
  story: { label: "Post to story", icon: Play },
};

const STATUS_FILL: Record<string, string> = {
  "Auto-approved": "#00a650",
  Approved: "#00a650",
  "Needs review": "#b06a00",
  Checking: "#8a8a8a",
  Rejected: "#e00b0b",
  Revoked: "#e00b0b",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const data = await getCampaignDetail(id);
  if (!data) notFound();

  const { campaign, totals } = data;

  const participation =
    totals.cohort > 0
      ? Math.round((totals.participants / totals.cohort) * 100)
      : 0;

  const approval =
    totals.approvalRate === null
      ? "—"
      : `${Math.round(totals.approvalRate * 100)}%`;

  return (
    <div className="stagger space-y-5">
      <div>
        <Link
          href="/admin/campaigns"
          className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Campaigns
        </Link>
      </div>

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <Card className="bg-reel">
        <CardBody className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="display text-[24px] leading-none text-ink">
                {campaign.title}
              </h1>
              <Badge tone={STATUS_TONE[campaign.status]} dot>
                {campaign.status}
              </Badge>
              {campaign.status === "live" && (
                <Badge tone="neutral">{timeRemaining(campaign.ends_at)}</Badge>
              )}
            </div>

            {campaign.description && (
              <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed font-semibold text-ink/80">
                {campaign.description}
              </p>
            )}

            <p className="mt-2 text-[12.5px] font-semibold text-ink/70">
              Handle <span className="text-ink">@{campaign.expected_handle}</span>
              {campaign.caption_hint ? ` · caption “${campaign.caption_hint}”` : ""}{" "}
              · created {formatDate(campaign.created_at)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {campaign.status === "draft" && (
              <ActionButton
                size="sm"
                action={setCampaignStatus.bind(null, campaign.id, "live")}
                confirmMessage={`Publish "${campaign.title}"? Every active ambassador sees it immediately.`}
              >
                Publish
              </ActionButton>
            )}
            {campaign.status === "live" && (
              <ActionButton
                size="sm"
                variant="secondary"
                action={setCampaignStatus.bind(null, campaign.id, "ended")}
                confirmMessage={`End "${campaign.title}"?`}
              >
                End
              </ActionButton>
            )}
            <CampaignEditDialog campaign={campaign} />

            {campaign.status !== "draft" && (
              <ActionButton
                size="sm"
                variant="secondary"
                action={archiveCampaign.bind(
                  null,
                  campaign.id,
                  campaign.status !== "archived",
                )}
                confirmMessage={
                  campaign.status === "archived"
                    ? undefined
                    : `Archive "${campaign.title}"? Its submissions and points are untouched — it just stops cluttering the list.`
                }
              >
                {campaign.status === "archived" ? "Unarchive" : "Archive"}
              </ActionButton>
            )}

            <Button size="sm" variant="secondary" asChild>
              <a href={campaign.instagram_url} target="_blank" rel="noopener noreferrer">
                Reel
                <ExternalLink aria-hidden />
              </a>
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ─── Headline numbers ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Took part"
          value={`${totals.participants}/${totals.cohort}`}
          sub={`${participation}% of active ambassadors`}
          icon={Users}
          tone="reel"
        />
        <Stat
          label="Submissions"
          value={totals.submissions}
          sub="Screenshots uploaded"
          icon={Upload}
          tone="brand"
        />
        <Stat
          label="Points paid"
          value={totals.pointsPaid}
          sub={`${formatNumber(totals.pointsAvailable)} available each`}
          icon={Percent}
          tone="rank"
        />
        <Stat
          label="Approval rate"
          value={approval}
          sub="Of decided screenshots"
          icon={Percent}
          tone="poll"
        />
      </div>

      {totals.submissions === 0 && campaign.status === "live" && (
        <Note tone="warn" title="Nobody has submitted yet">
          The campaign is live and visible on every ambassador dashboard. If
          this stays at zero, the ask may not be clear enough — or nobody has
          been told it went out.
        </Note>
      )}

      {/* ─── Tasks ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Task by task</h2>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
            Where students drop off. A task with submissions but few approvals
            is usually badly worded, not badly done.
          </p>

          <ul className="mt-4 space-y-3">
            {data.tasks.map((task) => {
              const meta = TASK_META[task.type] ?? {
                label: task.type,
                icon: Upload,
              };
              const Icon = meta.icon;

              return (
                <li key={task.id} className="brut-sm rounded-sm bg-canvas-sunk p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="brut-sm grid size-8 shrink-0 place-items-center rounded-xs bg-reel-tint">
                      <Icon className="size-4 text-ink" />
                    </span>
                    <span className="text-[14px] font-extrabold text-ink">
                      {meta.label}
                    </span>
                    <Badge tone="brand">+{task.points}</Badge>
                    {!task.required && <Badge tone="neutral">optional</Badge>}
                    <span className="ml-auto text-[12.5px] font-extrabold text-ink">
                      {task.approved}/{totals.cohort} approved
                    </span>
                  </div>

                  <ProgressBar
                    value={task.approved}
                    max={Math.max(1, totals.cohort)}
                    tone="reel"
                    className="mt-3"
                  />

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Badge tone="neutral">{task.submitted} submitted</Badge>
                    {task.waiting > 0 && (
                      <Badge tone="warn">{task.waiting} waiting</Badge>
                    )}
                    {task.rejected > 0 && (
                      <Badge tone="bad">{task.rejected} rejected</Badge>
                    )}
                    <Badge tone="ok">{formatNumber(task.pointsPaid)} points paid</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {/* ─── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Uploads per day" hint="Last 30 days.">
          <DayBars data={data.submissionsByDay} color="pink" />
        </ChartCard>

        <ChartCard
          title="Screenshot outcomes"
          hint="What happened to submissions on this campaign."
        >
          <BarList
            data={data.statusBreakdown.map((row) => ({
              ...row,
              color: STATUS_FILL[row.label],
            }))}
            emptyMessage="Nothing submitted yet."
          />
          <DataTable caption="Outcomes" rows={data.statusBreakdown} />
        </ChartCard>
      </div>

      {/* ─── People ────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="display text-[16px] text-ink">Who took part</h2>

            {data.participants.length === 0 ? (
              <EmptyState title="Nobody yet" />
            ) : (
              <ul className="mt-3 divide-y-[3px] divide-ink">
                {data.participants.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <span
                      aria-hidden
                      className="brut-sm grid size-8 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-extrabold text-ink"
                    >
                      {initials(p.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/ambassadors/${p.id}`}
                        className="truncate text-[13.5px] font-extrabold text-ink underline decoration-[3px] underline-offset-4 hover:decoration-reel"
                      >
                        {p.name}
                      </Link>
                      <p className="truncate text-[12px] text-ink-soft">
                        {p.approved} of {p.done} approved
                      </p>
                    </div>
                    <span className="tabular display shrink-0 text-[15px] text-ink">
                      {formatNumber(p.pointsEarned)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="display text-[16px] text-ink">Hasn&apos;t started</h2>
            <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
              Active ambassadors with nothing submitted — the list worth
              chasing.
            </p>

            {data.untouched.length === 0 ? (
              <EmptyState
                title="Everyone has had a go"
                description="Every active ambassador has submitted at least one screenshot."
              />
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.untouched.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/ambassadors/${p.id}`}
                      className={cn(
                        "brut-sm inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5",
                        "text-[12.5px] font-extrabold text-ink transition-transform hover:-translate-x-px hover:-translate-y-px",
                      )}
                    >
                      {p.name}
                    </Link>
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
