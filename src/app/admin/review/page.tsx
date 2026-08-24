import Link from "next/link";

import { ProofImage } from "@/components/proof-image";
import { SectionTabs, CAMPAIGN_TABS } from "@/components/section-tabs";
import { CheckCheck, CircleAlert, ExternalLink, Inbox, Sparkles } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { SearchBox } from "@/components/search-box";
import { matches } from "@/lib/search";
import { ReasonDialog } from "@/components/reason-dialog";
import { ReviewSelection, SelectSubmission } from "@/components/review-selection";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import {
  approveAllSubmissions,
  approveSubmission,
  rejectSubmission,
  revokeSubmission,
} from "@/lib/admin/actions";
import { getCampaignTitle, getReviewQueue } from "@/lib/admin/queries";
import { BLOCKING_CHECKS } from "@/lib/submissions/checks";
import { cn, formatDate, initials } from "@/lib/utils";

export const metadata = { title: "Review" };

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; campaign?: string }>;
}) {
  const { filter, q, campaign } = await searchParams;
  const showAll = filter === "all";
  const [all, campaignTitle] = await Promise.all([
    getReviewQueue(showAll ? "all" : "open", campaign),
    campaign ? getCampaignTitle(campaign) : Promise.resolve(null),
  ]);

  // The filter has to survive the Open/All tabs, or switching to All silently
  // widens the queue from one campaign to the whole programme.
  const tabHref = (allFilter: boolean) => {
    const params = new URLSearchParams();
    if (allFilter) params.set("filter", "all");
    if (campaign) params.set("campaign", campaign);
    const query = params.toString();
    return query ? `/admin/review?${query}` : "/admin/review";
  };

  const query = q ?? "";

  /**
   * How many the bulk button would act on.
   *
   * Counted from `all`, not from the search-filtered list: the action approves
   * everything open in scope. Which is also why the button hides while a
   * search is running — the screen would show three results above a button
   * that acts on forty, and searching is how you find one submission, never
   * how you choose a set. The campaign filter is different: that one narrows
   * the action too, so the two stay in step.
   */
  const openCount = all.filter(
    (item) => item.status === "pending" || item.status === "needs_review",
  ).length;
  const canApproveAll = openCount > 0 && !query;
  const items = all.filter((item) =>
    matches(query, item.ambassador.full_name, item.ambassador.college, item.campaign.title),
  );

  /**
   * What the tick boxes may act on: the undecided submissions actually on
   * screen. Unlike "Approve all" this one narrows with the search, because
   * ticking is how you choose a set — the button says how many, and the many
   * are the ones you can see.
   */
  const openIds = items
    .filter((item) => item.status === "pending" || item.status === "needs_review")
    .map((item) => item.id);

  return (
    <div className="stagger space-y-5">
      {/* The same tabs as Campaigns and the library: the queue is one of the
          three places this section takes you, and it should look like it. */}
      <SectionTabs tabs={CAMPAIGN_TABS} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Review queue
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Approving counts the task toward ambassador completion. Rejecting tells them why.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Only when there is something to approve, and it says how many —
              "Approve all" on its own is a button whose effect you cannot
              predict, which is the wrong kind of button to put next to
              somebody's points. Scoped to the campaign filter if one is on. */}
          {canApproveAll && (
            <ActionButton
              action={approveAllSubmissions.bind(null, campaign ?? null)}
              confirmMessage={
                campaign
                  ? `Approve all ${openCount} waiting on ${campaignTitle ?? "this campaign"}? Points are credited to each ambassador and this cannot be undone in bulk.`
                  : `Approve all ${openCount} waiting across every campaign? Points are credited to each ambassador and this cannot be undone in bulk.`
              }
            >
              <CheckCheck aria-hidden />
              Approve all {openCount}
            </ActionButton>
          )}

          <div className="brut-sm flex gap-1 rounded-sm bg-surface p-1">
            <FilterTab href={tabHref(false)} active={!showAll} label="Open" />
            <FilterTab href={tabHref(true)} active={showAll} label="All" />
          </div>
        </div>
      </div>

      {/* Named, and with the way out next to it. A queue scoped to one
          campaign looks exactly like an empty programme-wide queue, and an
          admin who arrived from a campaign card has no other way to tell
          which one they are looking at. */}
      {campaign && (
        <Note tone="neutral" className="flex flex-wrap items-center gap-x-2">
          <span>
            Showing{" "}
            <strong className="font-bold text-ink">
              {campaignTitle ?? "one campaign"}
            </strong>{" "}
            only.
          </span>
          <Link
            href={showAll ? "/admin/review?filter=all" : "/admin/review"}
            className="font-bold text-brand-strong hover:underline"
          >
            Show every campaign
          </Link>
        </Note>
      )}

      <SearchBox
        placeholder="Search by ambassador, college/office or campaign…"
        className="max-w-md"
      />

      {items.length === 0 ? (
        <Card>
          {/* An empty campaign-scoped queue and an empty programme-wide one
              are different facts, and saying "no submissions yet" about a
              campaign that has plenty would be wrong. */}
          <EmptyState
            icon={Inbox}
            title={
              campaign
                ? showAll
                  ? "Nothing submitted to this campaign"
                  : "Nothing waiting on this campaign"
                : showAll
                  ? "No submissions yet"
                  : "Queue is clear"
            }
            description={
              campaign
                ? showAll
                  ? "No ambassador has uploaded anything for it yet."
                  : "Every submission on it has been decided. Switch to All to see them."
                : showAll
                  ? "Screenshots uploaded by ambassadors land here for checking."
                  : "Nothing is waiting. Switch to All to see everything that has been reviewed."
            }
          />
        </Card>
      ) : (
        <ReviewSelection openIds={openIds}>
          <ul className="space-y-4">
            {items.map((item) => {
              const open =
                item.status === "pending" || item.status === "needs_review";

              return (
                // Ringed while ticked, so a selection you made forty cards ago is
                // still visible when you scroll back past it.
                <li
                  key={item.id}
                  className="rounded-xl ring-brand has-[input:checked]:ring-2"
                >
                  <Card>
                    <CardBody className="grid gap-5 md:grid-cols-[minmax(0,15rem)_1fr]">
                      {/* ─── Evidence ─────────────────────────────────────── */}
                      <div>
                        {/* Not every task is evidenced by an image. A LinkedIn
                            post is a URL and a quiz answer is prose, so the
                            panel renders whichever one this submission carries
                            rather than an empty 9:16 box. */}
                        {item.signedUrl ? (
                          <ProofImage
                            src={item.signedUrl}
                            alt={`Screenshot from ${item.ambassador.full_name}`}
                            className="brut-sm aspect-[9/16] bg-canvas-sunk"
                          />
                        ) : item.proof_url ? (
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <p className="text-[11px] font-bold tracking-wide text-ink-faint uppercase">
                              Link submitted
                            </p>
                            {/* noreferrer as well as noopener: the destination
                                is a URL a student typed, and it does not need
                                to know which admin screen sent the traffic. */}
                            <a
                              href={item.proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 flex items-start gap-1.5 text-[13px] font-bold break-all text-brand-strong hover:underline"
                            >
                              <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
                              {item.proof_url}
                            </a>
                          </div>
                        ) : item.proof_text ? (
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <p className="text-[11px] font-bold tracking-wide text-ink-faint uppercase">
                              Written answer
                            </p>
                            <p className="mt-2 text-[13.5px] leading-relaxed font-medium whitespace-pre-wrap text-ink">
                              {item.proof_text}
                            </p>
                          </div>
                        ) : (
                          <div className="brut-sm grid aspect-[9/16] place-items-center rounded-sm bg-canvas-sunk px-4 text-center">
                            <p className="text-[12.5px] text-ink-faint">
                              No evidence attached
                            </p>
                          </div>
                        )}

                        <p className="mt-2 text-[11.5px] text-ink-faint">
                          Uploaded {formatDate(item.uploaded_at, true)}
                          {item.attempt > 1 && ` · attempt ${item.attempt}`}
                        </p>
                      </div>

                      {/* ─── Detail ───────────────────────────────────────── */}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Only on the ones still waiting — a tick box beside a
                              decided submission would offer a decision that has
                              already been made. */}
                          {open && (
                            <SelectSubmission
                              id={item.id}
                              name={item.ambassador.full_name}
                            />
                          )}
                          <span
                            aria-hidden
                            className="brut-sm grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[11.5px] font-extrabold text-ink"
                          >
                            {initials(item.ambassador.full_name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-ink">
                              {item.ambassador.full_name}
                            </p>
                            {item.ambassador.college && (
                              <p className="truncate text-[12px] text-ink-soft">
                                {item.ambassador.college}
                              </p>
                            )}
                          </div>
                          <span className="ml-auto">
                            <StatusBadge status={item.status} />
                          </span>
                        </div>

                        <dl className="mt-4 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                          <Row label="Campaign" value={item.campaign.title} />
                          <Row
                            label="Task"
                            value={item.task.label}
                          />
                          <Row
                            label="Expected handle"
                            value={`@${item.campaign.expected_handle}`}
                          />
                          <Row
                            label="AI confidence"
                            value={
                              item.ai_confidence === null
                                ? "Not scored"
                                : `${Math.round(item.ai_confidence * 100)}%${item.ai_model ? ` · ${item.ai_model}` : ""}`
                            }
                          />
                        </dl>

                        <ChecksPanel checks={item.checks} />

                        {/* ─── Decision ───────────────────────────────────── */}
                        <div className="mt-5 flex flex-wrap gap-2">
                          {open ? (
                            <>
                              <ActionButton
                                action={approveSubmission.bind(null, item.id, undefined)}
                                confirmMessage={`Approve this task for ${item.ambassador.full_name}?`}
                              >
                                Approve task
                              </ActionButton>

                              <ReasonDialog
                                action={rejectSubmission.bind(null, item.id)}
                                title="Reject this screenshot"
                                description={`${item.ambassador.full_name} will see this reason, so make it something they can act on.`}
                                label="Reason"
                                optional
                                hint="Optional. Leave it empty and they're told the upload wasn't approved, without a specific reason."
                                placeholder="The handle in the screenshot doesn't match @dailymattr."
                                confirmLabel="Reject"
                                trigger={<Button variant="secondary">Reject</Button>}
                              />
                            </>
                          ) : (
                            <>
                              <Badge tone="neutral">
                                Reviewed {item.status.replace("_", " ")}
                              </Badge>

                              {/* What the ambassador was told. Without it a
                                  decided card cannot answer "why did we turn
                                  this one down", which is the question a
                                  student's follow-up message asks. */}
                              {item.reject_reason && (
                                <p className="w-full text-[12.5px] leading-relaxed text-ink-soft">
                                  <span className="font-extrabold text-ink">
                                    Reason:{" "}
                                  </span>
                                  {item.reject_reason}
                                </p>
                              )}
                              {(item.status === "approved" ||
                                item.status === "auto_approved") && (
                                <ReasonDialog
                                  action={revokeSubmission.bind(null, item.id)}
                                  title="Revoke this approval"
                                  description="This writes a compensating row to the ledger — the original credit stays in their history, with a matching reversal beside it."
                                  label="Reason"
                                  placeholder="Same screenshot submitted by two ambassadors."
                                  confirmLabel="Revoke"
                                  trigger={
                                    <Button variant="secondary" size="sm">
                                      Revoke
                                    </Button>
                                  }
                                />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        </ReviewSelection>
      )}
    </div>
  );
}

function FilterTab({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-xs px-3 py-1.5 text-[13px] font-extrabold transition-colors",
        active
          ? "bg-ink text-white"
          : "text-ink-soft hover:bg-canvas-sunk hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] tracking-wide text-ink-faint uppercase">
        {label}
      </dt>
      <dd className="truncate text-ink">{value}</dd>
    </div>
  );
}

/**
 * How to read a `false` that isn't a problem.
 *
 * `portrait` and `has_capture_time` are context, not verdicts — a student who
 * screenshots Instagram in a desktop browser gets a landscape image with no
 * EXIF, and both are entirely legitimate. Painting them red made a good
 * submission look like it had failed two checks, which is how a reviewer talks
 * themselves into rejecting real work.
 */
const CONTEXT_ONLY: Record<string, { yes: string; no: string }> = {
  portrait: { yes: "phone screenshot", no: "desktop or landscape" },
  has_capture_time: { yes: "has capture time", no: "no capture time" },
};

/**
 * The deterministic checks, rendered as pass/fail. These are what the pipeline
 * measured before any AI got involved, and they are the part a reviewer can
 * actually verify by looking at the image.
 */
function ChecksPanel({ checks }: { checks: unknown }) {
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) return null;

  const entries = Object.entries(checks as Record<string, unknown>);
  if (entries.length === 0) {
    return (
      <Note tone="neutral" className="mt-4">
        No automated checks recorded for this submission.
      </Note>
    );
  }

  // Only the checks that actually gate approval can "fail". The rest describe
  // the image.
  const failures = entries.filter(
    ([key, value]) =>
      value === false && (BLOCKING_CHECKS as readonly string[]).includes(key),
  );

  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-ink-faint" />
        <p className="text-[11.5px] tracking-wide text-ink-faint uppercase">
          Automated checks
        </p>
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {entries.map(([key, value]) => {
          const context = CONTEXT_ONLY[key];

          if (typeof value === "boolean" && context) {
            return (
              <li key={key}>
                <Badge tone="neutral">{value ? context.yes : context.no}</Badge>
              </li>
            );
          }

          const label = key.replace(/_/g, " ");
          if (typeof value === "boolean") {
            return (
              <li key={key}>
                <Badge tone={value ? "ok" : "bad"} dot>
                  {label}
                </Badge>
              </li>
            );
          }
          return (
            <li key={key}>
              <Badge tone="neutral">
                {label}: {String(value)}
              </Badge>
            </li>
          );
        })}
      </ul>

      {failures.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-bad">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {failures.length} {failures.length === 1 ? "check" : "checks"} failed —
          look closely before approving.
        </p>
      )}
    </div>
  );
}
