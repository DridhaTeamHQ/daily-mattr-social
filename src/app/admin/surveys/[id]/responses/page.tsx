import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Inbox } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { FilterChips, type ChipOption } from "@/components/filter-chips";
import { ReasonDialog } from "@/components/reason-dialog";
import { ResponseSummary } from "@/components/response-summary";
import { ResponseTable } from "@/components/response-table";
import { QuestionFilters, type QuestionFilter } from "@/components/question-filters";
import { ResponseFilters, type ResponseFilter } from "@/components/response-filters";
import {
  SurveyAmbassadors,
  type AmbassadorResponse,
} from "@/components/survey-ambassadors";
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
import {
  MAX_LISTED_ANSWERS,
  answerOptions,
  filterParam,
  matchesFilters,
  type ActiveFilter,
} from "@/lib/survey-filters";
import { aiEnabled } from "@/lib/ai";
import { describeDevice } from "@/lib/device";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Responses" };

export default async function SurveyResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // An index signature rather than the four keys it used to name: the
  // per-question filters are `f1`, `f2`, … one per question, and how many
  // there are is a property of the survey rather than of this file.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();

  const [{ id }, sp] = await Promise.all([params, searchParams]);

  // A repeated param arrives as an array; the page asks for one value each.
  const one = (key: string): string | undefined => {
    const value = sp[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const q = one("q");
  const status = one("status");
  const ambassador = one("amb");
  const view = one("view");
  const page = one("page");

  // The full list first, as it was before the summary took its place: the
  // client reads responses one by one and narrows them with the filters, and
  // the charts and per-ambassador breakdown are the second look, not the first.
  const isSummary = view === "summary";
  const isPeople = view === "ambassadors";
  const isList = !isSummary && !isPeople;

  const [data, people] = await Promise.all([
    getSurveyResponses(id),
    getSurveyAmbassadors(id),
  ]);
  if (!data) notFound();

  const query = q ?? "";

  type Row = (typeof data.responses)[number];
  const byStatus = (r: Row) => (status ? r.status === status : true);
  const byAmbassador = (r: Row) =>
    ambassador ? r.ambassadorId === ambassador : true;

  /**
   * Counting a response again — the same words wherever it is offered, the
   * table's button and the ambassador cards' ⋮ menu alike.
   */
  const restoreAction = (r: Row) =>
    setResponseStatus.bind(null, r.id, "valid", undefined);
  const restoreLabel = (r: Row) =>
    r.status === "duplicate"
      ? "Not a duplicate"
      : r.status === "flagged"
        ? "Remove flag"
        : "Count it";
  const restoreConfirm = (r: Row) => {
    const points = data.survey.points_per_response;
    return [
      r.status === "duplicate"
        ? `Mark ${r.name || "this response"} as not a duplicate?`
        : `Count ${r.name || "this response"} again?`,
      "",
      points > 0
        ? `It counts as a valid response and ${r.ambassador} gets ${points} point${points === 1 ? "" : "s"}.`
        : "It counts as a valid response.",
    ].join("\n");
  };

  // `?r=` narrows the list to one response: where "View in table" lands. An
  // id rather than their email or name, which do not belong in a URL.
  const only = one("r");

  /**
   * Search first, then status and ambassador, then per-question filters.
   *
   * Kept as steps because every dropdown counts its own options against
   * everything else that is on, excluding only itself. `searched` is the base
   * the status and ambassador dropdowns count from; `matching` is the base
   * the question dropdowns count from.
   */
  const searched = data.responses
    .filter((r) => (only ? r.id === only : true))
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

  const matching = searched.filter(byStatus).filter(byAmbassador);

  const active: ActiveFilter[] = data.questions.flatMap((question, index) => {
    const param = filterParam(index);
    const value = one(param);
    return value ? [{ questionId: question.id, param, value }] : [];
  });

  const responses = matching.filter((r) => matchesFilters(r, active));

  /**
   * Who else each response shares a network, email or phone with.
   *
   * Across the whole survey rather than the filtered list: "Duplicates" on
   * its own shows the second submission, and the point of the column is
   * naming the first one, which is usually a valid row the filter hid.
   */
  const groups = new Map<string, Row[]>();
  const keysOf = (r: Row) =>
    [
      r.ipHash ? ["Same network", `ip:${r.ipHash}`] : null,
      r.email ? ["Same email", `email:${r.email.trim().toLowerCase()}`] : null,
      r.phone
        ? ["Same phone", `phone:${r.phone.replace(/\D/g, "").slice(-10)}`]
        : null,
    ].filter((k): k is string[] => k !== null);

  for (const r of data.responses) {
    for (const [, key] of keysOf(r)) {
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
  }

  const matchesFor = (r: Row) =>
    keysOf(r).flatMap(([kind, key]) => {
      const others = (groups.get(key) ?? []).filter((o) => o.id !== r.id);
      if (others.length === 0) return [];

      // One person submitting fifteen times is one name, not fifteen: the
      // list read "Gundu Laksh, Gundu Laksh, Gundu Laksh…" to the end.
      const counts = new Map<string, number>();
      for (const o of others) {
        const name = o.name?.trim() || "Anonymous";
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return [
        {
          kind,
          names: [...counts]
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)),
        },
      ];
    });

  const countBy = (rows: Row[], key: (row: Row) => string) => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
    return counts;
  };

  const answering = (r: Row) => matchesFilters(r, active);
  const statusCounts = countBy(
    searched.filter(byAmbassador).filter(answering),
    (r) => r.status,
  );
  const ambassadorCounts = countBy(
    searched.filter(byStatus).filter(answering),
    (r) => r.ambassadorId,
  );

  // Everyone who has brought in a response stays in the dropdown whatever the
  // other filters leave them — a name vanishing when you pick "Duplicates"
  // reads as a bug, where "(0)" reads as an answer.
  const ambassadorNames = new Map<string, string>();
  for (const r of data.responses) ambassadorNames.set(r.ambassadorId, r.ambassador);

  const listFilters: ResponseFilter[] = !isList ? [] : [
    {
      param: "amb",
      label: "Ambassador",
      any: `All ambassadors (${ambassadorNames.size})`,
      value: ambassador ?? null,
      options: [...ambassadorNames]
        .map(([value, label]) => ({
          value,
          label,
          count: ambassadorCounts.get(value) ?? 0,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    },
    {
      param: "status",
      label: "Status",
      any: "All statuses",
      value: status ?? null,
      options: [
        { value: "valid", label: "Counted" },
        { value: "duplicate", label: "Duplicates" },
        { value: "flagged", label: "Flagged" },
      ].map((option) => ({
        ...option,
        count: statusCounts.get(option.value) ?? 0,
      })),
    },
  ];

  const questionFilters: QuestionFilter[] = !isList ? [] : data.questions.map(
    (question, index) => {
      const param = filterParam(index);

      // What choosing an option would leave: every other filter applied, this
      // question's own left out. Otherwise every option but the chosen one
      // reads zero, which tells you nothing about where to go next.
      const pool = matching.filter((r) => matchesFilters(r, active, param));
      const options = answerOptions(pool, question.id);
      const answered = pool.filter(
        (r) =>
          (r.answers.find((a) => a.questionId === question.id)?.values.length ??
            0) > 0,
      ).length;

      return {
        param,
        label: `Q${index + 1}`,
        prompt: question.prompt,
        value: active.find((f) => f.param === param)?.value ?? null,
        // Free text runs to roughly one distinct answer per response, and a
        // dropdown of two hundred sentences is not a filter. Those keep
        // Answered / Skipped; the search box finds a phrase inside them.
        listed: options.length <= MAX_LISTED_ANSWERS,
        options,
        answered,
        skipped: pool.length - answered,
      };
    },
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

  /**
   * The same view, narrowed to one status.
   *
   * Every other choice is carried: changing the status used to drop you back
   * on the summary with the search cleared, so "show me the duplicates"
   * undid the work of getting to the list you wanted them narrowed from. Only
   * the page number is dropped, since a different status has different pages.
   */
  const href = (next: { view?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (next.view) query.set("view", next.view);
    if (q) query.set("q", q);
    if (ambassador) query.set("amb", ambassador);
    for (const filter of active) query.set(filter.param, filter.value);
    if (next.status) query.set("status", next.status);
    const search = query.toString();
    return search
      ? `/admin/surveys/${id}/responses?${search}`
      : `/admin/surveys/${id}/responses`;
  };

  /** A status tile, keeping the view and the narrowing you already had. */
  const statusHref = (next?: string) => href({ view, status: next });

  /** A view chip, keeping the status and the narrowing you already had. */
  const viewHref = (next?: string) => href({ view: next, status });

  const pageHref = (n: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (ambassador) next.set("amb", ambassador);
    // Without these, page 2 of a filtered list is page 2 of the whole list.
    for (const filter of active) next.set(filter.param, filter.value);
    if (n > 1) next.set("page", String(n));
    return `/admin/surveys/${id}/responses?${next.toString()}`;
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
        <StatLink href={statusHref(undefined)} label="All" value={data.responses.length} tone="brand" active={!status} />
        <StatLink href={statusHref("valid")} label="Counted" value={data.counts.valid} tone="poll" active={status === "valid"} />
        <StatLink href={statusHref("duplicate")} label="Duplicates" value={data.counts.duplicate} tone="invite" active={status === "duplicate"} />
        <StatLink href={statusHref("flagged")} label="Flagged" value={data.counts.flagged} tone="reel" active={status === "flagged"} />
      </div>

      <FilterChips
        label="View"
        active={isSummary ? "summary" : isPeople ? "ambassadors" : "responses"}
        options={
          [
            {
              key: "responses",
              label: `All responses (${data.responses.length})`,
              href: viewHref(),
            },
            {
              key: "summary",
              label: "Summary",
              href: viewHref("summary"),
            },
            {
              key: "ambassadors",
              label: `By ambassador (${people.length})`,
              href: viewHref("ambassadors"),
            },
          ] satisfies ChipOption[]
        }
      />

      {isPeople && (
        <SurveyAmbassadors
          rows={people}
          surveyId={id}
          responses={Object.groupBy(
            data.responses.map((response) => ({
              ambassadorId: response.ambassadorId,
              id: response.id,
              name: response.name,
              status: response.status,
              submitted: formatDate(response.submittedAt, true),
              email: response.email,
              phone: response.phone,
              device: describeDevice(response.userAgent),
              reason: response.flagReason,
              matches: matchesFor(response),
              menu: {
                tableHref: `/admin/surveys/${id}/responses?r=${response.id}`,
                ...(response.status !== "valid" && {
                  restore: restoreAction(response),
                  restoreLabel: restoreLabel(response),
                  confirmMessage: restoreConfirm(response),
                }),
              },
            })),
            (response) => response.ambassadorId,
          ) as Record<string, AmbassadorResponse[]>}
        />
      )}

      {isSummary && <ResponseSummary data={data} />}

      {isList && (
        <div className="space-y-3">
          <SearchBox
            placeholder="Search names, emails, or anything they answered…"
            className="max-w-lg"
          />

          <ResponseFilters filters={listFilters} />

          <QuestionFilters filters={questionFilters} />
        </div>
      )}

      {isList && (responses.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={
              query || status || ambassador || only || active.length > 0
                ? "Nothing matches that"
                : "No responses yet"
            }
            description={
              query || status || ambassador || only || active.length > 0
                ? "Try a different search, or clear the filters."
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
              device: describeDevice(response.userAgent),
              matches: matchesFor(response),
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
                  // Named for what it undoes. "Restore" on a duplicate read
                  // as restoring the duplicate, and nobody found it.
                  <ActionButton
                    size="sm"
                    action={restoreAction(response)}
                    confirmMessage={restoreConfirm(response)}
                  >
                    {restoreLabel(response)}
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
          image_url: q.image_url,
          // jsonb, so it arrives as `unknown` and is narrowed once here.
          option_images: Array.isArray(q.option_images)
            ? (q.option_images as (string | null)[])
            : [],
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
  href,
  label,
  value,
  tone,
  active,
}: {
  href: string;
  label: string;
  value: number;
  tone: "brand" | "poll" | "invite" | "reel";
  active: boolean;
}) {
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
