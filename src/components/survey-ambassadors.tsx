import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Flag,
  Mail,
  Phone,
  Pointer,
  Smartphone,
} from "lucide-react";

import { ExpandableRow } from "@/components/expandable-row";
import { ResponseMenu } from "@/components/response-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { SurveyAmbassador } from "@/lib/admin/participation";
import { cn, formatNumber, initials } from "@/lib/utils";

/**
 * One survey, broken down by the ambassadors carrying it.
 *
 * Split into two lists rather than one sorted table. "Nobody has clicked their
 * link" and "people clicked and did not finish" are different failures needing
 * different responses, and a single ranked list buries the first group at the
 * bottom where nobody scrolls.
 */
/** One response, as the ambassador lists show it. */
export type AmbassadorResponse = {
  id: string;
  name: string | null;
  status: "valid" | "duplicate" | "flagged" | "rejected";
  submitted: string;
  email: string | null;
  phone: string | null;
  device: string | null;
  /** Why it is not counted — written by the duplicate check or an admin. */
  reason: string | null;
  /** Other responses to this survey sharing a network, email or phone. */
  matches: { kind: string; names: string[] }[];
  /** What the ⋮ menu offers — built on the server with the action bound. */
  menu: React.ComponentProps<typeof ResponseMenu>;
};

type Responses = Record<string, AmbassadorResponse[]>;

export function SurveyAmbassadors({
  rows,
  responses,
  surveyId,
}: {
  rows: SurveyAmbassador[];
  /** Every response, keyed by the ambassador who brought it in. */
  responses: Responses;
  surveyId: string;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Pointer}
          title="No links issued yet"
          description="Publish the survey to give every active ambassador their own link."
        />
      </Card>
    );
  }

  const collecting = rows.filter((r) => r.responses > 0);
  const quiet = rows.filter((r) => r.responses === 0);

  return (
    <div className="space-y-4">
      <Duplicates rows={rows} responses={responses} surveyId={surveyId} />

      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Collecting</h2>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
            {collecting.length} of {rows.length} ambassadors have brought in at
            least one response.
          </p>

          {collecting.length === 0 ? (
            <p className="mt-4 text-[13px] font-semibold text-ink-faint">
              Nobody yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {collecting.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  responses={responses[row.id] ?? []}
                  surveyId={surveyId}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Nothing yet</h2>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
            Clicks with no responses means the survey is losing people. No
            clicks at all means the link was never shared — two different
            conversations.
          </p>

          {quiet.length === 0 ? (
            <p className="mt-4 text-[13px] font-semibold text-emerald-600">
              Everyone with a link has collected something.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {quiet.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  responses={responses[row.id] ?? []}
                  surveyId={surveyId}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({
  row,
  responses,
  surveyId,
}: {
  row: SurveyAmbassador;
  responses: AmbassadorResponse[];
  surveyId: string;
}) {
  const summary = (
    <>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100 text-[11.5px] font-extrabold text-ink"
      >
        {initials(row.name)}
      </span>

      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/ambassadors/${row.id}`}
          className="block truncate text-[13.5px] font-bold text-ink hover:underline"
        >
          {row.name}
        </Link>
        <p className="truncate text-[12px] text-ink-soft">
          {[row.city, row.batch].filter(Boolean).join(" · ") ||
            "No city or batch set"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4 text-right">
        <Figure
          label="Clicks"
          value={formatNumber(row.clicks)}
          muted={row.clicks === 0}
        />
        <Figure
          label="Responses"
          value={formatNumber(row.responses)}
          muted={row.responses === 0}
        />
        <Figure
          label="Dupes"
          value={formatNumber(row.duplicates)}
          muted={row.duplicates === 0}
          tone={row.duplicates > 0 ? "warn" : undefined}
        />
        <Figure
          label="Rate"
          value={
            row.conversion === null
              ? "—"
              : `${Math.round(row.conversion * 100)}%`
          }
          muted={row.conversion === null}
        />
      </div>

      {row.flagged > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">
          <Flag className="size-3" />
          {row.flagged} flagged
        </span>
      )}
    </>
  );

  if (responses.length === 0) {
    return (
      <li className="flex flex-wrap items-center gap-3 py-2.5">{summary}</li>
    );
  }

  return (
    <ExpandableRow
      summary={summary}
      label={`${formatNumber(responses.length)} response${responses.length === 1 ? "" : "s"}`}
    >
      <ResponseList
        responses={responses}
        href={`/admin/surveys/${surveyId}/responses?amb=${row.id}`}
      />
    </ExpandableRow>
  );
}

function Figure({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value: string;
  muted: boolean;
  /** Amber for a figure that is bad news when it is not zero. */
  tone?: "warn";
}) {
  return (
    <div className="w-14">
      <p
        className={cn(
          "tabular text-[14px] font-extrabold",
          muted
            ? "text-ink-faint"
            : tone === "warn"
              ? "text-amber-600"
              : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] font-bold tracking-wide text-ink-faint uppercase">
        {label}
      </p>
    </div>
  );
}

/**
 * Where the duplicates are coming from.
 *
 * The stat tiles above say how many duplicates the survey has; they cannot say
 * whose they are, and "22 duplicates" is only actionable once it reads "18 of
 * them from one person". Duplicates spread thinly across everyone is a form
 * that is easy to submit twice — a survey problem. Duplicates concentrated on
 * one ambassador is that ambassador — a person problem. The same number means
 * opposite things, so it is broken out rather than totalled.
 *
 * Ranked by count, and the share is of everything that ambassador brought in
 * rather than of all duplicates: two duplicates out of three responses is a
 * worse signal than six out of ninety, and ranking alone would put them the
 * wrong way round.
 */
function Duplicates({
  rows,
  responses,
  surveyId,
}: {
  rows: SurveyAmbassador[];
  responses: Responses;
  surveyId: string;
}) {
  const offenders = rows
    .filter((row) => row.duplicates > 0)
    .sort(
      (a, b) => b.duplicates - a.duplicates || a.name.localeCompare(b.name),
    );

  const total = offenders.reduce((sum, row) => sum + row.duplicates, 0);
  const worst = offenders[0]?.duplicates ?? 1;

  return (
    <Card>
      <CardBody>
        <h2 className="display text-[16px] text-ink">
          Duplicates by ambassador
        </h2>

        {offenders.length === 0 ? (
          <p className="mt-1 text-[12.5px] font-semibold text-emerald-600">
            Nothing marked as a duplicate on this survey.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
              {formatNumber(total)} duplicate{total === 1 ? "" : "s"} from{" "}
              {offenders.length} of {rows.length} ambassador
              {rows.length === 1 ? "" : "s"}. The share is of everything that
              person brought in.
            </p>

            <ul className="mt-3 divide-y divide-gray-100">
              {offenders.map((row) => (
                <ExpandableRow
                  key={row.id}
                  label={`See ${formatNumber(row.duplicates)}`}
                  summary={
                    <>
                      <span
                        aria-hidden
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50 text-[11.5px] font-extrabold text-amber-700"
                      >
                        {initials(row.name)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/ambassadors/${row.id}`}
                          className="block truncate text-[13.5px] font-bold text-ink hover:underline"
                        >
                          {row.name}
                        </Link>
                        <p className="truncate text-[12px] text-ink-soft">
                          {formatNumber(row.responses)} counted ·{" "}
                          {formatNumber(row.duplicates)} duplicate
                          {row.duplicates === 1 ? "" : "s"}
                          {row.flagged > 0
                            ? ` · ${formatNumber(row.flagged)} flagged`
                            : ""}
                        </p>
                      </div>

                      {/* Width against the worst offender, so the shape of the
                      problem is readable without doing the division. */}
                      <div className="hidden h-2.5 w-28 shrink-0 overflow-hidden rounded-full bg-gray-100 sm:block">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{
                            width: `${Math.max(6, (row.duplicates / worst) * 100)}%`,
                          }}
                        />
                      </div>

                      <div className="w-16 shrink-0 text-right">
                        <p className="tabular text-[14px] font-extrabold text-amber-600">
                          {formatNumber(row.duplicates)}
                        </p>
                        <p className="tabular text-[10.5px] font-bold text-ink-faint">
                          {row.duplicateRate === null
                            ? "—"
                            : `${Math.round(row.duplicateRate * 100)}% of theirs`}
                        </p>
                      </div>
                    </>
                  }
                >
                  <ResponseList
                    responses={(responses[row.id] ?? []).filter(
                      (r) => r.status === "duplicate",
                    )}
                    href={`/admin/surveys/${surveyId}/responses?amb=${row.id}&status=duplicate`}
                  />
                </ExpandableRow>
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

const STATUS_TONE = {
  valid: "ok",
  duplicate: "warn",
  flagged: "warn",
  rejected: "bad",
} as const;

/**
 * Every response behind an ambassador's numbers, one card each.
 *
 * Not-counted ones first and with their reason in full: "12 duplicates" only
 * becomes a conversation you can have with the ambassador once it reads
 * "same network as Siddu, four minutes apart" twelve times.
 */
function ResponseList({
  responses,
  href,
}: {
  responses: AmbassadorResponse[];
  /** The same people in the full table, where they can be acted on. */
  href: string;
}) {
  const ordered = [...responses].sort(
    (a, b) => Number(a.status === "valid") - Number(b.status === "valid"),
  );

  return (
    <div className="space-y-2 rounded-xl bg-gray-50 p-2.5 sm:p-3">
      <ul className="grid gap-2 lg:grid-cols-2">
        {ordered.map((response) => (
          <li
            key={response.id}
            className="rounded-lg border border-gray-200 bg-surface px-3.5 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold text-ink">
                {response.name || "Anonymous"}
              </p>
              <Badge tone={STATUS_TONE[response.status]} dot>
                {response.status}
              </Badge>
              <ResponseMenu {...response.menu} />
            </div>

            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold text-ink-soft">
              <Fact icon={Clock} value={response.submitted} />
              <Fact icon={Mail} value={response.email} />
              <Fact icon={Phone} value={response.phone} />
              <Fact icon={Smartphone} value={response.device} />
            </div>

            {(response.reason || response.matches.length > 0) && (
              <div className="mt-2.5 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
                {response.reason && (
                  <p className="text-[12.5px] leading-snug font-bold text-ink">
                    {response.reason}
                  </p>
                )}
                {response.matches.map((match) => (
                  <p
                    key={match.kind}
                    className="text-[12px] leading-snug font-semibold text-ink-soft"
                  >
                    {match.kind} as{" "}
                    <span className="font-bold text-ink">
                      {match.names.join(", ")}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <Link
        href={href}
        className="inline-flex items-center gap-1 px-1 text-[12.5px] font-bold text-brand-strong hover:underline"
      >
        Open these in the table, with their answers
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

function Fact({
  icon: Icon,
  value,
}: {
  icon: typeof Clock;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1 [overflow-wrap:anywhere]">
      <Icon aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
      {value}
    </span>
  );
}
