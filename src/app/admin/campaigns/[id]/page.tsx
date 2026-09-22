import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BellRing,
  Inbox,
  Upload,
  ExternalLink,
  Percent,
  Users,
} from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { CampaignEditDialog } from "@/components/edit-dialogs";
import { SchedulePublishDialog } from "@/components/schedule-publish";
import { CampaignTaskManager } from "@/components/campaign-task-manager";
import { BarList, ChartCard, DataTable, DayBars } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { remindUntouched, setCampaignStatus } from "@/lib/admin/actions";
import { archiveCampaign, deleteCampaign } from "@/lib/admin/edit-actions";
import { getCampaignDetail, requireAdmin } from "@/lib/admin/queries";
import { getActiveVersion } from "@/lib/programme-version";
import { createCachedAdminClient as createAdminClient } from "@/lib/admin/cached-client";
import { cn, formatDate, formatNumber, initials, timeRemaining } from "@/lib/utils";

export const metadata = { title: "Campaign" };

const STATUS_TONE = {
  live: "ok",
  draft: "neutral",
  ended: "neutral",
  archived: "neutral",
} as const;

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
  const [data, activeVersion] = await Promise.all([
    getCampaignDetail(id, 14),
    getActiveVersion(),
  ]);
  if (!data) notFound();

  const { data: library } = await (await createAdminClient())
    .from("task_library")
    .select("id, label, platform, default_points, proof_type")
    .eq("active", true)
    .order("platform", { ascending: true, nullsFirst: false })
    .order("label", { ascending: true });

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
              {/* White, not ink: the header sits on a saturated violet, and
                  near-black on it — at 70% for the meta line — was under the
                  contrast a body of text needs to be read at a glance. */}
              <h1 className="display text-[24px] leading-none text-white">
                {campaign.title}
              </h1>
              <Badge tone={STATUS_TONE[campaign.status]} dot>
                {campaign.status}
              </Badge>
              {campaign.status === "live" && (
                <Badge tone="neutral">{timeRemaining(campaign.ends_at)}</Badge>
              )}
              {campaign.status === "draft" && campaign.publish_at && (
                <Badge tone="warn">scheduled</Badge>
              )}
            </div>

            {campaign.description && (
              <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed font-semibold text-white/95">
                {campaign.description}
              </p>
            )}

            <p className="mt-2 text-[12.5px] font-semibold text-white/85">
              Handle <span className="font-extrabold text-white">@{campaign.expected_handle}</span>
              {campaign.caption_hint ? ` · caption “${campaign.caption_hint}”` : ""}{" "}
              · created {formatDate(campaign.created_at)}
              {/* Said in the header's own colours rather than with the list's
                  `ScheduledNote`, which is drawn for a white card. The "draft"
                  chip above is true of a scheduled campaign and of one nobody
                  has touched; this is the line that tells them apart. */}
              {campaign.status === "draft" && campaign.publish_at && (
                <>
                  {" · goes live "}
                  <span className="font-extrabold text-white">
                    {formatDate(campaign.publish_at, true)}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {campaign.status === "draft" && (
              <>
                <ActionButton
                  size="sm"
                  action={setCampaignStatus.bind(null, campaign.id, "live")}
                  confirmMessage={
                    campaign.publish_at
                      ? `Publish "${campaign.title}" now? This cancels the schedule and every active ambassador sees it immediately.`
                      : `Publish "${campaign.title}"? Every active ambassador sees it immediately.`
                  }
                >
                  Publish now
                </ActionButton>

                <SchedulePublishDialog
                  kind="campaign"
                  id={campaign.id}
                  publishAt={campaign.publish_at}
                  endsAt={campaign.ends_at}
                />
              </>
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
            <CampaignEditDialog
              campaign={campaign}
              tasks={data.tasks.map((t) => ({
                id: t.id,
                label: t.label,
                label_override: t.label_override,
                points: t.points,
                required: t.required,
                instructions: t.instructions,
                submitted: t.submitted,
              }))}
            />

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
                    : `Archive "${campaign.title}"? Its submissions are untouched. It just stops cluttering the list.`
                }
              >
                {campaign.status === "archived" ? "Unarchive" : "Archive"}
              </ActionButton>
            )}

            {/* Same queue as the card in the list, so an admin who came in
                through Analytics does not have to go back out to reach it. */}
            <Button size="sm" variant="secondary" asChild>
              <Link href={`/admin/review?campaign=${campaign.id}`}>
                <Inbox aria-hidden />
                Review
              </Link>
            </Button>

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
          <p className="mt-1 mb-4 text-[12.5px] font-semibold text-ink-soft">
            Where students drop off, and where you change the ask. A task with
            submissions but few approvals is usually badly worded, not badly
            done.
          </p>

          <CampaignTaskManager
            campaignId={campaign.id}
            campaignPlatform={campaign.platform}
            library={library ?? []}
            tasks={data.tasks.map((t) => ({
              id: t.id,
              label: t.label,
              platform: t.platform,
              points: t.points,
              required: t.required,
              instructions: t.instructions,
              submitted: t.submitted,
            }))}
          />
        </CardBody>
      </Card>

      {/* ─── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Fourteen days rather than thirty: a month of columns in a
            half-width card is fifteen pixels a day, which is a fence rather
            than a chart, and a campaign's uploads arrive in the days after it
            goes out. A fortnight is wide enough to hold the burst and narrow
            enough that every bar gets its own date underneath. */}
        <ChartCard title="Uploads per day" hint="Last 14 days.">
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
                      {p.approved}/{p.done} approved
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="display text-[16px] text-ink">
                  Hasn&apos;t started
                </h2>
                <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
                  Active ambassadors with nothing submitted — the list worth
                  chasing.
                </p>
              </div>

              {/* Three conditions, and the action re-checks all of them.
                  Somebody to chase; a live campaign, because a reminder about
                  an ended one sends them to an upload button that refuses;
                  and a campaign in the run that is currently open, because
                  nobody is being asked for an earlier run's work. Hidden
                  rather than disabled: a greyed button invites a click and
                  then explains itself, which is a worse way to learn this. */}
              {data.untouched.length > 0 &&
                data.campaign.status === "live" &&
                data.campaign.version === activeVersion && (
                <ActionButton
                  size="sm"
                  variant="secondary"
                  action={remindUntouched.bind(null, data.campaign.id)}
                  confirmMessage={`Send a reminder to the ${data.untouched.length} ambassador${
                    data.untouched.length === 1 ? "" : "s"
                  } who haven't started "${data.campaign.title}"? They'll get it in their notifications, and a push if they've turned those on. Nobody else is told.`}
                >
                  <BellRing aria-hidden />
                  Push reminder
                </ActionButton>
              )}
            </div>

            {/* A button that is simply not there is a mystery, and this is
                the one case where its absence has a cause worth naming: the
                campaign is real, it is live, there are people to chase, and
                the only thing stopping the nudge is that it belongs to a run
                of the programme that has been closed. Their dashboards show
                the open run, so the reminder would send them to a page with
                nothing on it. */}
            {data.untouched.length > 0 &&
              data.campaign.status === "live" &&
              data.campaign.version !== activeVersion && (
                <Note tone="warn" size="sm" className="mt-3">
                  These {data.untouched.length} can&apos;t be reminded about
                  this campaign. It belongs to an earlier run of the programme,
                  and students only see the run that is open — the notification
                  would send them to an empty page. Make that run current again
                  on Overview, or publish this work in the open one.
                </Note>
              )}

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

      {/* ─── Danger zone ─────────────────────────────────────────────────────
          At the bottom of the campaign's own page rather than on the list.
          A grid of cards repeats every button, and an irreversible one
          repeated is one mis-aimed click from deleting the wrong campaign;
          here it is unmistakably about the campaign you are reading. */}
      <Card className="border-bad-line">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="display text-[16px] text-ink">Delete this campaign</h2>
            <p className="mt-1 text-[13px] text-ink-soft">
              Removes the campaign, its {data.tasks.length} task
              {data.tasks.length === 1 ? "" : "s"} and{" "}
              {totals.submissions} submission
              {totals.submissions === 1 ? "" : "s"}. Points paid for those
              submissions are reversed. Archiving keeps all of it and just
              hides the campaign.
            </p>
          </div>

          <ActionButton
            size="sm"
            variant="secondary"
            className="shrink-0 text-bad hover:bg-bad-tint"
            action={deleteCampaign.bind(null, campaign.id)}
            confirmMessage={[
              `Delete "${campaign.title}" and everything in it?`,
              "",
              `· ${data.tasks.length} task${data.tasks.length === 1 ? "" : "s"}`,
              `· ${totals.submissions} submission${totals.submissions === 1 ? "" : "s"}, including the uploaded screenshots`,
              "",
              "Points paid for them are reversed. This cannot be undone.",
            ].join("\n")}
          >
            Delete campaign
          </ActionButton>
        </CardBody>
      </Card>
    </div>
  );
}
