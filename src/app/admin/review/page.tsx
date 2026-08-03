import Image from "next/image";
import Link from "next/link";
import { CircleAlert, Inbox, Sparkles } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { ReasonDialog } from "@/components/reason-dialog";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import {
  approveSubmission,
  rejectSubmission,
  revokeSubmission,
} from "@/lib/admin/actions";
import { getReviewQueue } from "@/lib/admin/queries";
import { cn, formatDate, initials } from "@/lib/utils";

export const metadata = { title: "Review" };

const TASK_LABEL: Record<string, string> = {
  like: "Like",
  comment: "Comment",
  share: "Share",
  story: "Story",
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const showAll = filter === "all";
  const items = await getReviewQueue(showAll ? "all" : "open");

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Review queue
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Approving credits the ambassador&apos;s ledger. Rejecting tells them
            why.
          </p>
        </div>

        <div className="brut-sm flex gap-1 rounded-sm bg-surface p-1">
          <FilterTab href="/admin/review" active={!showAll} label="Open" />
          <FilterTab href="/admin/review?filter=all" active={showAll} label="All" />
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={showAll ? "No submissions yet" : "Queue is clear"}
            description={
              showAll
                ? "Screenshots uploaded by ambassadors land here for checking."
                : "Nothing is waiting. Switch to All to see everything that has been reviewed."
            }
          />
        </Card>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const open =
              item.status === "pending" || item.status === "needs_review";

            return (
              <li key={item.id}>
                <Card>
                  <CardBody className="grid gap-5 md:grid-cols-[minmax(0,15rem)_1fr]">
                    {/* ─── Evidence ─────────────────────────────────────── */}
                    <div>
                      <div className="brut-sm relative aspect-[9/16] overflow-hidden rounded-sm bg-canvas-sunk">
                        {item.signedUrl ? (
                          <Image
                            src={item.signedUrl}
                            alt={`Screenshot from ${item.ambassador.full_name}`}
                            fill
                            sizes="(max-width: 768px) 100vw, 15rem"
                            className="object-contain"
                            unoptimized
                          />
                        ) : (
                          <div className="grid h-full place-items-center px-4 text-center">
                            <p className="text-[12.5px] text-ink-faint">
                              Screenshot unavailable
                            </p>
                          </div>
                        )}
                      </div>

                      <p className="mt-2 text-[11.5px] text-ink-faint">
                        Uploaded {formatDate(item.uploaded_at, true)}
                        {item.attempt > 1 && ` · attempt ${item.attempt}`}
                      </p>
                    </div>

                    {/* ─── Detail ───────────────────────────────────────── */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
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
                          value={`${TASK_LABEL[item.task.type] ?? item.task.type} · +${item.task.points} points`}
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
                              confirmMessage={`Approve and credit ${item.task.points} points to ${item.ambassador.full_name}?`}
                            >
                              Approve · +{item.task.points}
                            </ActionButton>

                            <ReasonDialog
                              action={rejectSubmission.bind(null, item.id)}
                              title="Reject this screenshot"
                              description={`${item.ambassador.full_name} will see this reason, so make it something they can act on.`}
                              label="Reason"
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

  const failures = entries.filter(([, v]) => v === false);

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
