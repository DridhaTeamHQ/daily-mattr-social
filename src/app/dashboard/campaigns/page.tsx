import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Clapperboard,
  ExternalLink,
  Heart,
  MessageCircle,
  Play,
  Share2,
  Sparkles,
  Upload,
} from "lucide-react";

import { CampaignCard } from "@/components/campaign-card";
import { SurveyLinkCard } from "@/components/survey-link-card";
import { StatusBadge, SUBMISSION_STATUS } from "@/components/ui/badge";
import { UploadTask } from "@/components/upload-task";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import {
  getCampaigns,
  getDashboard,
  getSurveyMeta,
  surveyTargetFor,
  type CampaignCard as CampaignCardData,
} from "@/lib/queries";
import { getSetting } from "@/lib/settings";
import { getSiteUrl } from "@/lib/site-url";
import { timeRemaining } from "@/lib/utils";
import type { Enums } from "@/lib/database.types";

export const metadata = { title: "Tasks" };

const TASK_META: Record<
  Enums<"task_type">,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  like: { label: "Like the reel", icon: Heart },
  comment: { label: "Leave a comment", icon: MessageCircle },
  share: { label: "Share it", icon: Share2 },
  story: { label: "Post to your story", icon: Play },
};

/**
 * The networks that always get a button, in the order the programme cares
 * about them. Any other network a campaign is on gets a button too, appended
 * — a filter that can hide a campaign with no way to reach it is worse than
 * no filter.
 */
const PINNED = ["Instagram", "YouTube", "X", "LinkedIn"];

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  // `getDashboard` is what the layout already loaded and it is memoised per
  // request, so reading the surveys off it here is free — no second round trip.
  const [campaigns, data, surveyMeta, siteUrl, sharedTarget] =
    await Promise.all([
      getCampaigns(),
      getDashboard(),
      getSurveyMeta(),
      getSiteUrl(),
      getSetting("stipend_min_responses_per_survey"),
    ]);
  if (!campaigns || !data) redirect("/login");

  const surveys = data.surveys;
  const { platform } = await searchParams;

  const available = [
    ...PINNED,
    ...campaigns
      .map((c) => c.platform)
      .filter((p): p is string => Boolean(p) && !PINNED.includes(p!)),
  ].filter((p, i, all) => all.indexOf(p) === i);

  // An unknown value in the URL shows everything rather than an empty page.
  const active = platform && available.includes(platform) ? platform : null;
  const visible = active
    ? campaigns.filter((c) => c.platform === active)
    : campaigns;

  /**
   * Campaigns and surveys in one list, newest first.
   *
   * Two stacked sections meant a survey published this morning sat below a
   * campaign from three weeks ago, which is not how anyone reads a feed of
   * work. One list, one order, and the card shape says which kind it is.
   *
   * A survey has no network, so the chips above only filter campaigns and the
   * surveys drop out while one is picked — a LinkedIn filter that still showed
   * every survey would not be a filter.
   */
  const items = [
    ...visible.map((campaign) => ({
      key: `campaign:${campaign.id}`,
      at: campaign.starts_at,
      campaign,
      survey: null,
    })),
    ...(active
      ? []
      : surveys.map((survey) => ({
          key: `survey:${survey.survey_id}`,
          // ISO strings, so a plain string compare is a date compare. A survey
          // with no date sorts last rather than jumping to the top.
          at: surveyMeta.get(survey.survey_id)?.createdAt ?? "",
          campaign: null,
          survey,
        }))),
  ].sort((left, right) => right.at.localeCompare(left.at));

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={Clapperboard}
        tone="reel"
        title="Tasks"
        description="Finish the challenge, submit your proof, and build your completion percentage."
      />

      {/* Keyed on the list that actually renders, not on campaigns alone.
          Surveys sit in the same list, so counting only campaigns put "no live
          tasks" directly above a live survey. */}
      {!active && items.length === 0 && (
        <Card>
          <EmptyState
            icon={Clapperboard}
            title="No live tasks right now"
            description="When the team publishes a reel or a survey, it shows up here with everything you can complete."
          />
        </Card>
      )}

      {/* ─── Network filter ──────────────────────────────────────────────
          Links rather than buttons with state: the filter belongs in the URL,
          so a student can send "the YouTube ones" to a friend and the back
          button does what they expect. */}
      {campaigns.length > 0 && (
        <nav aria-label="Filter by network" className="flex flex-wrap gap-2">
          <FilterChip
            href="/dashboard/campaigns"
            label="All"
            active={!active}
          />
          {available.map((p) => (
            <FilterChip
              key={p}
              href={`/dashboard/campaigns?platform=${encodeURIComponent(p)}`}
              label={p}
              active={active === p}
              count={campaigns.filter((c) => c.platform === p).length}
            />
          ))}
        </nav>
      )}

      {/* The filtered-to-nothing case owns its own message, so the general
          empty state above steps aside while a network is picked. */}
      {active && visible.length === 0 && (
        <Card>
          <EmptyState
            icon={Clapperboard}
            title={`Nothing on ${active} right now`}
            description="Try another network, or All to see everything that is live."
          />
        </Card>
      )}

      {items.map((item) =>
        item.campaign ? (
          <CampaignBlock key={item.key} c={item.campaign} />
        ) : (
          <SurveyLinkCard
            key={item.key}
            survey={item.survey!}
            siteUrl={siteUrl}
            target={surveyTargetFor(
              surveyMeta.get(item.survey!.survey_id),
              sharedTarget,
            )}
          />
        ),
      )}
    </div>
  );
}

/** One campaign, with its tasks and the upload button for each. */
function CampaignBlock({ c }: { c: CampaignCardData }) {
  const ended = timeRemaining(c.ends_at) === "Ended";
  const expectedHandle = c.expected_handle;
  const isClip = c.title.includes("CLIP");

  const credited = c.tasks.filter(
    (t) =>
      t.submission_status === "approved" ||
      t.submission_status === "auto_approved",
  );
  const doneCount = credited.length;

  return (
    <CampaignCard
      id={c.id}
      variant={isClip ? "clip" : "reel"}
      title={c.title}
      description={c.description}
      deadlineLabel={timeRemaining(c.ends_at)}
      ended={ended}
      taskCount={c.tasks.length}
      doneCount={doneCount}
    >
      <CardBody className="px-6 pt-0 pb-6">
        <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {c.tasks.map((t) => {
            // A library task has no enum type, so fall back to its own
            // label and a neutral icon rather than indexing with null.
            const meta = t.type ? TASK_META[t.type] : undefined;
            const Icon = meta?.icon ?? Upload;
            const help = t.submission_status
              ? SUBMISSION_STATUS[t.submission_status]?.help
              : null;

            // The reviewer's own words, where they wrote any. This is the only
            // place a student learns what to fix — the notification that
            // carried it scrolls away, the badge just says "Rejected".
            const turnedDown =
              t.submission_status === "rejected" ||
              t.submission_status === "revoked";

            return (
              <li key={t.id} className="flex items-center gap-4 p-4">
                <div
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-xl",
                    isClip
                      ? "bg-brand-tint text-brand-strong"
                      : "bg-gray-100 text-gray-800",
                  )}
                >
                  <Icon className="size-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-extrabold text-ink">
                      {t.label}
                    </p>
                    {!t.required && (
                      <span className="text-[12px] font-medium text-ink-soft">
                        Optional
                      </span>
                    )}
                  </div>

                  {t.instructions && (
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                      {t.instructions}
                    </p>
                  )}

                  {help && (
                    <p className="mt-1.5 text-[12px] font-medium text-ink-soft">
                      {help}
                    </p>
                  )}

                  {turnedDown && t.submission_reason && (
                    <p className="mt-2 rounded-lg border border-bad-line bg-bad-tint px-3 py-2 text-[12.5px] leading-relaxed font-semibold text-bad">
                      <span className="mr-1 font-extrabold">Reviewer:</span>
                      {t.submission_reason}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  {t.submission_status &&
                  t.submission_status !== "rejected" &&
                  t.submission_status !== "revoked" ? (
                    <StatusBadge status={t.submission_status} />
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      {t.submission_status && (
                        <StatusBadge status={t.submission_status} />
                      )}
                      <UploadTask
                        taskId={t.id}
                        taskLabel={t.label}
                        expectedHandle={expectedHandle}
                        disabled={ended}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>

      <CardFooter
        className={cn(
          "flex items-center justify-between gap-3 px-6 py-4 border-t-0 rounded-b-xl",
          isClip ? "bg-brand-tint/50" : "bg-gray-50/50",
        )}
      >
        <p className="text-[13px] font-medium text-ink-soft flex items-center gap-2">
          <Sparkles
            className={cn(
              "size-4",
              isClip ? "text-brand-strong" : "text-gray-600",
            )}
          />
          Complete the task, then upload your screenshot.
        </p>
        <Button
          size="sm"
          className={cn(
            "text-white border-0 shadow-sm transition-transform hover:scale-[1.02]",
            isClip
              ? "bg-brand-strong hover:bg-brand-press"
              : "bg-black hover:bg-gray-800",
          )}
          asChild
        >
          <a href={c.instagram_url} target="_blank" rel="noopener noreferrer">
            Open reel
            <ExternalLink aria-hidden />
          </a>
        </Button>
      </CardFooter>
    </CampaignCard>
  );
}

/**
 * One network in the filter row.
 *
 * The count sits on the chip rather than in a tooltip because "0" is the most
 * useful thing it can say — it tells you not to bother tapping.
 */
function FilterChip({
  href,
  label,
  active,
  count,
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-gray-200 bg-white text-ink hover:border-gray-300 hover:bg-gray-50",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "tabular text-[12px] font-extrabold",
            active ? "text-white/70" : "text-gray-400",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
