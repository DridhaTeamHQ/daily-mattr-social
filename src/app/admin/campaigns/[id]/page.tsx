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
  XCircle,
} from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { CampaignEditDialog } from "@/components/edit-dialogs";
import { SchedulePublishDialog } from "@/components/schedule-publish";
import { CampaignTaskManager } from "@/components/campaign-task-manager";
import { ChartCard, DataTable, DayBars, Donut } from "@/components/charts";
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
import { formatDate, initials, timeRemaining } from "@/lib/utils";

import { ParticipantList } from "./participant-list";
import { PeopleTabs } from "./people-tabs";

export const metadata = { title: "Campaign" };

const STATUS_TONE = {
  live: "ok",
  draft: "neutral",
  ended: "neutral",
  archived: "neutral",
} as const;

const STATUS_FILL: Record<string, string> = {
  "Auto-approved": "#34d399",
  Approved: "#16a34a",
  "Needs review": "#f59e0b",
  Checking: "#9ca3af",
  Rejected: "#ef4444",
  Revoked: "#b91c1c",
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

  // One tab each. Waiting beats rejected beats approved, so somebody with
  // anything still open is filed where it can be acted on.
  const reviewPeople = data.participants.filter((p) => p.waiting > 0);
  const rejectedPeople = data.participants.filter(
    (p) => p.waiting === 0 && p.rejected > 0,
  );
  const approvedPeople = data.participants.filter(
    (p) => p.waiting === 0 && p.rejected === 0,
  );

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
        <Stat
          label="Rejection rate"
          value={
            totals.rejectionRate === null
              ? "—"
              : `${Math.round(totals.rejectionRate * 100)}%`
          }
          sub={`${totals.rejected} rejected screenshot${totals.rejected === 1 ? "" : "s"}`}
          icon={XCircle}
          tone="invite"
        />
      </div>

      {totals.submissions === 0 && campaign.status === "live" && (
        <Note tone="warn" title="Nobody has submitted yet">
          The campaign is live and visible on every ambassador dashboard. If
          this stays at zero, the ask may not be clear enough — or nobody has
          been told it went out.
        </Note>
      )}

      {/* ─── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Fourteen days rather than thirty: a month of columns in a
            half-width card is fifteen pixels a day, which is a fence rather
            than a chart, and a campaign's uploads arrive in the days after it
            goes out. A fortnight is wide enough to hold the burst and narrow
            enough that every bar gets its own date underneath. */}
        <ChartCard title="Uploads per day" hint="Last 14 days.">
          <DayBars data={data.submissionsByDay} color="violet" noun="uploads" />
        </ChartCard>

        <ChartCard
          title="Screenshot outcomes"
          hint="What happened to submissions on this campaign."
        >
          <Donut
            data={data.statusBreakdown.map((row) => ({
              ...row,
              color: STATUS_FILL[row.label] ?? "#9ca3af",
            }))}
            totalLabel="submissions"
            emptyMessage="Nothing submitted yet."
          />
          <DataTable caption="Outcomes" rows={data.statusBreakdown} />
        </ChartCard>
      </div>

      {/* ─── People ──────────────────────────────────────────────────────────
          Everyone on the campaign in one card, a tab per outcome. Somebody
          with a mix of outcomes on a multi-task campaign is filed by what is
          still open: anything waiting puts them under In review, otherwise
          anything sent back puts them under Rejected. */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="display text-[16px] text-ink">Ambassadors</h2>
              <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
                {totals.participants} of {totals.cohort} active ambassadors
                have submitted. Open a row for their proof and the reason
                behind a rejection.
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
                  Remind {data.untouched.length} not started
                </ActionButton>
              )}
          </div>

          {/* A button that is simply not there is a mystery, and this is
              the one case where its absence has a cause worth naming: the
              campaign is live and there are people to chase, but it belongs
              to a run of the programme that has been closed. Their dashboards
              show the open run, so the reminder would land on an empty page. */}
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

          <div className="mt-4">
            <PeopleTabs
              initial={approvedPeople.length ? "approved" : "not-started"}
              tabs={[
                {
                  key: "approved",
                  label: "Approved",
                  count: approvedPeople.length,
                  color: "#16a34a",
                  content: approvedPeople.length ? (
                    <ParticipantList participants={approvedPeople} />
                  ) : (
                    <EmptyState title="Nobody approved yet" />
                  ),
                },
                {
                  key: "rejected",
                  label: "Rejected",
                  count: rejectedPeople.length,
                  color: "#ef4444",
                  content: rejectedPeople.length ? (
                    <ParticipantList participants={rejectedPeople} />
                  ) : (
                    <EmptyState title="Nobody rejected" />
                  ),
                },
                {
                  key: "review",
                  label: "In review",
                  count: reviewPeople.length,
                  color: "#f59e0b",
                  content: reviewPeople.length ? (
                    <ParticipantList participants={reviewPeople} />
                  ) : (
                    <EmptyState title="Nothing waiting for review" />
                  ),
                },
                {
                  key: "not-started",
                  label: "Not started",
                  count: data.untouched.length,
                  color: "#9ca3af",
                  content:
                    data.untouched.length === 0 ? (
                      <EmptyState
                        title="Everyone has had a go"
                        description="Every active ambassador has submitted at least one screenshot."
                      />
                    ) : (
                      <ul className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                        {data.untouched.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center gap-3 border-b border-line py-2.5"
                          >
                            <span
                              aria-hidden
                              className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-extrabold text-ink-soft"
                            >
                              {initials(p.name)}
                            </span>
                            <Link
                              href={`/admin/ambassadors/${p.id}`}
                              className="truncate text-[13px] font-bold text-ink hover:underline"
                            >
                              {p.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ),
                },
              ]}
            />
          </div>
        </CardBody>
      </Card>

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

      {/* ─── Danger zone ─────────────────────────────────────────────────────
          At the bottom of the campaign's own page rather than on the list.
          A grid of cards repeats every button, and an irreversible one
          repeated is one mis-aimed click from deleting the wrong campaign;
          here it is unmistakably about the campaign you are reading. */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50/50 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[14px] font-extrabold text-red-900">Delete this campaign</h2>
          <p className="mt-1 text-[12.5px] text-red-900/70">
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
      </section>
    </div>
  );
}
