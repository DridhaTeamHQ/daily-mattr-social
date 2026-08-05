import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Inbox, Mail, Phone } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { FilterChips, type ChipOption } from "@/components/filter-chips";
import { ReasonDialog } from "@/components/reason-dialog";
import { ResponseSummary } from "@/components/response-summary";
import { SearchBox } from "@/components/search-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { requireAdmin, getSurveyResponses } from "@/lib/admin/queries";
import { setResponseStatus } from "@/lib/admin/edit-actions";
import { matches } from "@/lib/search";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Responses" };

const STATUS_TONE = {
  valid: "ok",
  duplicate: "warn",
  flagged: "warn",
  rejected: "bad",
} as const;

export default async function SurveyResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; status?: string; view?: string }>;
}) {
  await requireAdmin();

  const [{ id }, { q, status, view }] = await Promise.all([
    params,
    searchParams,
  ]);

  // Summary first. It answers "what did people say", which is why the
  // survey was run; the individual list answers "what did this person say",
  // which matters far less often.
  const isList = view === "responses";
  const data = await getSurveyResponses(id);
  if (!data) notFound();

  const query = q ?? "";

  const responses = data.responses
    .filter((r) => (status ? r.status === status : true))
    .filter((r) =>
      matches(
        query,
        r.name,
        r.email,
        r.phone,
        r.ambassador,
        // Searching answer text is the whole point of reading responses.
        ...r.answers.map((a) => a.answer),
      ),
    );

  return (
    <div className="stagger space-y-5">
      <div>
        <Link
          href="/admin/surveys"
          className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Surveys
        </Link>

        <h1 className="display mt-2 text-[26px] leading-none text-ink">
          {data.survey.title}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          {data.responses.length} response
          {data.responses.length === 1 ? "" : "s"} · {data.questions.length}{" "}
          question{data.questions.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatLink id={id} status={undefined} label="All" value={data.responses.length} tone="brand" active={!status} />
        <StatLink id={id} status="valid" label="Counted" value={data.counts.valid} tone="poll" active={status === "valid"} />
        <StatLink id={id} status="duplicate" label="Duplicates" value={data.counts.duplicate} tone="invite" active={status === "duplicate"} />
        <StatLink id={id} status="flagged" label="Flagged" value={data.counts.flagged} tone="reel" active={status === "flagged"} />
      </div>

      <FilterChips
        label="View"
        active={isList ? "responses" : "summary"}
        options={
          [
            {
              key: "summary",
              label: "Summary",
              href: `/admin/surveys/${id}/responses`,
            },
            {
              key: "responses",
              label: `Individual (${data.responses.length})`,
              href: `/admin/surveys/${id}/responses?view=responses`,
            },
          ] satisfies ChipOption[]
        }
      />

      {!isList && <ResponseSummary data={data} />}

      {isList && (
      <SearchBox
        placeholder="Search names, emails, or anything they answered…"
        className="max-w-lg"
      />
      )}

      {isList && (responses.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={
              query || status ? "Nothing matches that" : "No responses yet"
            }
            description={
              query || status
                ? "Try a different search, or clear the filter."
                : "When someone completes an ambassador's link, their answers appear here."
            }
          />
        </Card>
      ) : (
        <ul className="space-y-4">
          {responses.map((response, index) => (
            <li key={response.id}>
              <Card>
                <CardBody>
                  {/* ─── Who ─────────────────────────────────────────────── */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="brut-sm display grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[12px] text-ink">
                      {index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-extrabold text-ink">
                        {response.name || "Anonymous"}
                      </p>
                      <p className="text-[12px] font-semibold text-ink-soft">
                        via {response.ambassador} ·{" "}
                        {formatDate(response.submittedAt, true)}
                      </p>
                    </div>

                    <Badge tone={STATUS_TONE[response.status]} dot>
                      {response.status}
                    </Badge>
                  </div>

                  {(response.email || response.phone) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {response.email && (
                        <span className="brut-sm inline-flex items-center gap-1.5 rounded-full bg-canvas-sunk px-2.5 py-1 text-[12px] font-bold text-ink">
                          <Mail className="size-3.5" />
                          {response.email}
                        </span>
                      )}
                      {response.phone && (
                        <span className="brut-sm inline-flex items-center gap-1.5 rounded-full bg-canvas-sunk px-2.5 py-1 text-[12px] font-bold text-ink">
                          <Phone className="size-3.5" />
                          {response.phone}
                        </span>
                      )}
                    </div>
                  )}

                  {response.flagReason && (
                    <Note tone="warn" className="mt-3">
                      {response.flagReason}
                    </Note>
                  )}

                  {/* ─── Answers ─────────────────────────────────────────── */}
                  <dl className="mt-4 space-y-2.5">
                    {response.answers.map((answer) => (
                      <div
                        key={answer.questionId}
                        className="brut-sm rounded-sm bg-canvas-sunk px-3.5 py-2.5"
                      >
                        <dt className="text-[12px] font-extrabold tracking-wide text-ink/70 uppercase">
                          {answer.prompt}
                        </dt>
                        <dd
                          className={
                            answer.answer === "—"
                              ? "mt-1 text-[14px] font-semibold text-ink-faint"
                              : "mt-1 text-[14.5px] leading-relaxed font-bold text-ink"
                          }
                        >
                          {answer.answer === "—" ? "Skipped" : answer.answer}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {/* Moderation. Flagging reverses the point the response
                      earned — leaving the points on the balance would make the
                      flag cosmetic and let somebody farm their own link. */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
                    {response.status === "valid" ? (
                      <>
                        <ReasonDialog
                          title="Mark as duplicate"
                          description="The point this earned is reversed. The original credit stays in their history next to the reversal."
                          label="Why"
                          placeholder="Same person answered twice"
                          confirmLabel="Mark duplicate"
                          action={async (reason: string) =>
                            setResponseStatus(response.id, "duplicate", reason)
                          }
                          trigger={
                            <Button size="sm" variant="secondary">
                              Duplicate
                            </Button>
                          }
                        />
                        <ReasonDialog
                          title="Flag this response"
                          description="Use for answers that look made up or copied. The point is reversed."
                          label="Why"
                          placeholder="Every answer identical to the one above"
                          confirmLabel="Flag"
                          action={async (reason: string) =>
                            setResponseStatus(response.id, "flagged", reason)
                          }
                          trigger={
                            <Button size="sm" variant="secondary">
                              Flag
                            </Button>
                          }
                        />
                      </>
                    ) : (
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        action={setResponseStatus.bind(
                          null,
                          response.id,
                          "valid",
                          undefined,
                        )}
                        confirmMessage="Count this response again? The point goes back."
                      >
                        Restore
                      </ActionButton>
                    )}

                    {response.flagReason && (
                      <span className="text-[12px] font-semibold text-ink-soft">
                        {response.flagReason}
                      </span>
                    )}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

/** A stat tile that is also the status filter. */
function StatLink({
  id,
  status,
  label,
  value,
  tone,
  active,
}: {
  id: string;
  status?: string;
  label: string;
  value: number;
  tone: "brand" | "poll" | "invite" | "reel";
  active: boolean;
}) {
  const href = status
    ? `/admin/surveys/${id}/responses?status=${status}`
    : `/admin/surveys/${id}/responses`;

  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={active ? "" : "opacity-70 transition-opacity hover:opacity-100"}
    >
      <Stat label={label} value={value} tone={tone} sub={active ? "Showing" : "Filter"} />
    </Link>
  );
}
