import Link from "next/link";
import { ClipboardList, Eye, Globe, MessageSquareText, Users } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { SurveyEditDialog } from "@/components/edit-dialogs";
import { CompletionRing, Pagination, StatusPill } from "@/components/list-card";
import {
  SchedulePublishDialog,
  ScheduledNote,
} from "@/components/schedule-publish";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { issueSurveyLinks, setSurveyStatus } from "@/lib/admin/actions";
import {
  SURVEYS_PAGE_SIZE,
  getAdminSurveyPage,
  type AdminSurvey,
} from "@/lib/admin/queries";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Surveys" };

export default async function AdminSurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const pageNumber = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  // Ten surveys, fetched as ten — see `getAdminSurveyPage`.
  const list = await getAdminSurveyPage(pageNumber);
  const { surveys } = list;

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Surveys
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Publishing a survey issues a personal link to every active
            ambassador.
          </p>
        </div>

        <Button asChild>
          <Link href="/admin/surveys/new">New survey</Link>
        </Button>
      </div>

      {surveys.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={list.total > 0 ? "Nothing on this page" : "No surveys yet"}
            description={
              list.total > 0
                ? "This page is past the end of the list."
                : "Build one with your own questions, then publish it to send links out."
            }
          />
        </Card>
      ) : (
        <>
          <ul className="grid gap-4 lg:grid-cols-2">
            {surveys.map((s) => (
              <li key={s.id} className="min-w-0">
                <SurveyCard survey={s} />
              </li>
            ))}
          </ul>

          <Pagination
            page={list.page}
            pageCount={list.pageCount}
            pageSize={SURVEYS_PAGE_SIZE}
            total={list.total}
            shown={surveys.length}
            noun="surveys"
            hrefFor={(n) => (n > 1 ? `/admin/surveys?page=${n}` : "/admin/surveys")}
          />
        </>
      )}
    </div>
  );
}

/**
 * One survey, in the same shape as a campaign card: a coloured tile for who
 * it is for, the title and status, a ring for how far it has got, and one
 * line of figures.
 */
function SurveyCard({ survey: s }: { survey: AdminSurvey }) {
  const participant = s.audience === "participant";

  // What the ring measures depends on who answers. Ambassadors answering
  // themselves: how many of the links issued came back. Public responses
  // with a cap: how close to the cap. Public with no cap has no finish line,
  // so there is no ring — the response count stands on its own.
  const ring = participant
    ? { done: s.responseCount, of: s.linkCount, title: `${s.responseCount} of ${s.linkCount} ambassadors answered` }
    : s.response_cap
      ? { done: s.responseCount, of: s.response_cap, title: `${s.responseCount} of ${s.response_cap} responses collected` }
      : null;

  return (
    <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          {/* Who it is for, in colour: violet when ambassadors answer it
              themselves, teal when they collect answers from the public. */}
          <span
            title={participant ? "Ambassadors answer" : "Public responses"}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-sm",
              participant
                ? "bg-gradient-to-br from-violet-500 to-indigo-600"
                : "bg-gradient-to-br from-teal-400 to-cyan-600",
            )}
          >
            {participant ? (
              <Users className="size-5" aria-hidden />
            ) : (
              <Globe className="size-5" aria-hidden />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <Link
              href={`/admin/surveys/${s.id}/responses`}
              className="line-clamp-2 text-[15.5px] leading-tight font-extrabold text-ink hover:text-brand"
            >
              {s.title}
            </Link>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusPill status={s.status} />
              {/* 'draft' is true of a scheduled survey and of one nobody has
                  touched; this tells them apart. */}
              {s.status === "draft" && s.publish_at && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                  scheduled
                </span>
              )}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  participant ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700",
                )}
              >
                {participant ? "Ambassadors answer" : "Public responses"}
              </span>
            </div>
          </div>

          {ring ? (
            <CompletionRing done={ring.done} of={ring.of} title={ring.title} />
          ) : (
            <div
              title={`${s.responseCount} responses so far`}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-teal-50 text-center"
            >
              <span className="tabular text-[13px] leading-none font-extrabold text-teal-700">
                {s.responseCount}
              </span>
            </div>
          )}
        </div>

        {s.description && (
          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-soft">
            {s.description}
          </p>
        )}

        {s.status === "draft" && s.publish_at && (
          <ScheduledNote publishAt={s.publish_at} />
        )}

        {s.status === "live" && s.linkCount === 0 && (
          <Note tone="warn" size="sm">
            Live, but nobody has a link. Issue links below or ambassadors
            won&apos;t see it.
          </Note>
        )}

        <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-soft">
          <span>
            <span className="font-bold text-ink">{s.questionCount}</span>{" "}
            question{s.questionCount === 1 ? "" : "s"}
          </span>
          <span>
            <span className="font-bold text-ink">{s.linkCount}</span> links
          </span>
          <span>
            <span className="font-bold text-ink">{s.responseCount}</span>
            {s.audience === "public" && s.response_cap ? `/${s.response_cap}` : ""}{" "}
            response{s.responseCount === 1 ? "" : "s"}
          </span>
          <span className="ml-auto text-ink-faint">{formatDate(s.created_at)}</span>
        </p>
      </CardBody>

      <CardFooter className="flex flex-wrap items-center gap-2">
        <SurveyEditDialog survey={s} responseCount={s.responseCount} />

        {/* What the person who opens the link sees — asked before
            publishing and again after every edit. */}
        <Button size="sm" variant="secondary" asChild>
          <Link href={`/admin/surveys/${s.id}/preview`}>
            <Eye aria-hidden />
            Preview
          </Link>
        </Button>

        {/* Publish and Schedule are the same decision asked at two different
            times, so they sit together. */}
        {s.status === "draft" && (
          <>
            <ActionButton
              size="sm"
              action={setSurveyStatus.bind(null, s.id, "live")}
              confirmMessage={
                s.publish_at
                  ? `Publish "${s.title}" now? This cancels the schedule and every active ambassador gets their link immediately.`
                  : `Publish "${s.title}"? Every active ambassador gets their own link.`
              }
            >
              Publish now
            </ActionButton>

            <SchedulePublishDialog kind="survey" id={s.id} publishAt={s.publish_at} />
          </>
        )}

        {s.status === "live" && (
          <>
            <ActionButton
              size="sm"
              variant="secondary"
              action={issueSurveyLinks.bind(null, s.id)}
            >
              Issue links
            </ActionButton>
            <ActionButton
              size="sm"
              variant="secondary"
              action={setSurveyStatus.bind(null, s.id, "closed")}
              confirmMessage={`Close "${s.title}"? Existing links stop accepting responses.`}
            >
              Close
            </ActionButton>
          </>
        )}

        {s.status === "closed" && (
          <ActionButton
            size="sm"
            variant="secondary"
            action={setSurveyStatus.bind(null, s.id, "live")}
          >
            Re-open
          </ActionButton>
        )}

        {/* Delete lives on the survey's own page: an irreversible action
            repeated down a list is one mis-aimed click from the wrong one. */}

        <Button
          size="sm"
          variant={s.responseCount > 0 ? "primary" : "secondary"}
          className="ml-auto"
          asChild
        >
          <Link href={`/admin/surveys/${s.id}/responses`}>
            <MessageSquareText aria-hidden />
            Responses
            {s.responseCount > 0 && (
              <span className="tabular ml-0.5 rounded-full bg-white/25 px-1.5 text-[11.5px] font-bold">
                {s.responseCount}
              </span>
            )}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
