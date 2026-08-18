import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Inbox } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { FilterChips, type ChipOption } from "@/components/filter-chips";
import { ReasonDialog } from "@/components/reason-dialog";
import { ResponseSummary } from "@/components/response-summary";
import { ResponseTable } from "@/components/response-table";
import { SurveyAmbassadors } from "@/components/survey-ambassadors";
import { SurveyQuestionsEditor } from "@/components/survey-questions-editor";
import { SearchBox } from "@/components/search-box";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { requireAdmin, getSurveyResponses } from "@/lib/admin/queries";
import { getSurveyAmbassadors } from "@/lib/admin/participation";
import { deleteSurvey, setResponseStatus } from "@/lib/admin/edit-actions";
import { matches } from "@/lib/search";
import { aiEnabled } from "@/lib/ai";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Responses" };

export default async function SurveyResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    view?: string;
    page?: string;
  }>;
}) {
  await requireAdmin();

  const [{ id }, { q, status, view, page }] = await Promise.all([
    params,
    searchParams,
  ]);

  // Summary first. It answers "what did people say", which is why the
  // survey was run; the individual list answers "what did this person say",
  // which matters far less often.
  const isList = view === "responses";
  const isPeople = view === "ambassadors";

  const [data, people] = await Promise.all([
    getSurveyResponses(id),
    getSurveyAmbassadors(id),
  ]);
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

  /**
   * Pages, not an endless list.
   *
   * A survey that works has hundreds of responses, and rendering all of them
   * means the browser holds every answer in the DOM to show twenty-five. A
   * page number in the URL also makes "the ones I was looking at" a place you
   * can come back to, which a scroll position is not.
   */
  const PER_PAGE = 25;
  const pages = Math.max(1, Math.ceil(responses.length / PER_PAGE));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (current - 1) * PER_PAGE;
  const visible = responses.slice(start, start + PER_PAGE);

  const pageHref = (n: number) => {
    const sp = new URLSearchParams({ view: "responses" });
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (n > 1) sp.set("page", String(n));
    return `/admin/surveys/${id}/responses?${sp.toString()}`;
  };

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
        active={isList ? "responses" : isPeople ? "ambassadors" : "summary"}
        options={
          [
            {
              key: "summary",
              label: "Summary",
              href: `/admin/surveys/${id}/responses`,
            },
            {
              key: "ambassadors",
              label: `By ambassador (${people.length})`,
              href: `/admin/surveys/${id}/responses?view=ambassadors`,
            },
            {
              key: "responses",
              label: `Individual (${data.responses.length})`,
              href: `/admin/surveys/${id}/responses?view=responses`,
            },
          ] satisfies ChipOption[]
        }
      />

      {isPeople && <SurveyAmbassadors rows={people} />}

      {!isList && !isPeople && <ResponseSummary data={data} />}

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
        <div className="space-y-3">
          <ResponseTable
            questions={data.questions.map((question) => ({
              id: question.id,
              prompt: question.prompt,
            }))}
            rows={visible.map((response, index) => ({
              id: response.id,
              index: start + index + 1,
              name: response.name,
              ambassador: response.ambassador,
              submitted: formatDate(response.submittedAt, true),
              email: response.email,
              phone: response.phone,
              status: response.status,
              flagReason: response.flagReason,
              answers: response.answers,
              // Flagging reverses the point the response earned — leaving the
              // points on the balance would make the flag cosmetic and let
              // somebody farm their own link.
              actions:
                response.status === "valid" ? (
                  <>
                    <ReasonDialog
                      title="Mark as duplicate"
                      description="The point this earned is reversed. The original credit stays in their history next to the reversal."
                      label="Why"
                      placeholder="Same person answered twice"
                      confirmLabel="Mark duplicate"
                      action={setResponseStatus.bind(
                        null,
                        response.id,
                        "duplicate",
                      )}
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
                      action={setResponseStatus.bind(
                        null,
                        response.id,
                        "flagged",
                      )}
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
                ),
            }))}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] font-semibold text-ink-soft">
              Showing {start + 1}–{start + visible.length} of{" "}
              {responses.length}
              {responses.length === data.responses.length
                ? ""
                : ` (of ${data.responses.length} in total)`}
            </p>

            {pages > 1 && (
              <div className="flex items-center gap-1.5">
                <PageLink
                  href={pageHref(current - 1)}
                  disabled={current === 1}
                  label="Previous"
                />
                <span className="tabular px-2 text-[12.5px] font-bold text-ink">
                  {current} / {pages}
                </span>
                <PageLink
                  href={pageHref(current + 1)}
                  disabled={current === pages}
                  label="Next"
                />
              </div>
            )}
          </div>
        </div>
      ))}

      <SurveyQuestionsEditor
        surveyId={id}
        answered={data.responses.length > 0}
        aiEnabled={aiEnabled()}
        questions={data.questions.map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          help_text: q.help_text,
          options: Array.isArray(q.options) ? (q.options as string[]) : [],
        }))}
      />

      {/* ─── Danger zone ─────────────────────────────────────────────────────
          On the survey's own page rather than in the list, where an
          irreversible button repeated down a column is one mis-aimed click
          from deleting the wrong survey. Here it is unmistakably about the
          survey whose responses you are reading. */}
      <Card className="border-bad-line">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="display text-[16px] text-ink">Delete this survey</h2>
            <p className="mt-1 text-[13px] text-ink-soft">
              Removes the survey, its {data.questions.length} question
              {data.questions.length === 1 ? "" : "s"}, every issued link, and
              all {data.responses.length} response
              {data.responses.length === 1 ? "" : "s"} with the answers inside
              them. Points paid for those responses are reversed. Closing the
              survey keeps everything and just stops new answers.
            </p>
          </div>

          <ActionButton
            size="sm"
            variant="secondary"
            className="shrink-0 text-bad hover:bg-bad-tint"
            action={deleteSurvey.bind(null, id)}
            confirmMessage={[
              `Delete "${data.survey.title}" and everything in it?`,
              "",
              `· ${data.questions.length} question${data.questions.length === 1 ? "" : "s"}`,
              "· every issued link, which stops working",
              `· ${data.responses.length} response${data.responses.length === 1 ? "" : "s"} and every answer inside them`,
              "",
              "Points paid for them are reversed. This cannot be undone.",
            ].join("\n")}
          >
            Delete survey
          </ActionButton>
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * One step through the pages.
 *
 * A span rather than a disabled link at the ends: there is nothing to
 * navigate to, and a link that goes nowhere is worse than no link.
 */
function PageLink({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12.5px] font-bold text-ink-faint">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-[12.5px] font-bold text-ink hover:bg-gray-50"
    >
      {label}
    </Link>
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
      <Stat label={label} value={value} tone={tone} sub={active ? "Showing" : "Filter"} interactive />
    </Link>
  );
}
