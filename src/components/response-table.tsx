"use client";

import * as React from "react";
import {
  ChevronRight,
  Clock,
  Mail,
  Phone,
  ShieldAlert,
  Smartphone,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Individual responses, as a grid instead of a stack of cards.
 *
 * Every response used to be its own card with every question spelled out —
 * twelve responses to a five-question survey was sixty labelled boxes and a
 * page you scroll rather than read, and three hundred responses was
 * unusable. Worse, the one thing an admin does here is compare: is this
 * person's answer the same as the one above it, are these four submissions
 * suspiciously identical. A stack of cards puts the answers to the same
 * question hundreds of pixels apart, which is the one layout that makes that
 * comparison impossible.
 *
 * So: one row per person, one column per question. Answers to the same
 * question sit under each other, duplicates are visible as a repeated column,
 * and the whole page fits on a screen. Cells clamp to two lines — the row is
 * for scanning, not for reading an essay — and a row opens to the full text
 * and the moderation controls when there is something to act on.
 *
 * Everything known about the person comes before the answers — status, who
 * brought them in, when, their contact details, their device and who else
 * they share a network, email or phone with. Deciding whether a row is a
 * duplicate used to mean opening it; now the evidence sits in the row.
 */

export type ResponseRow = {
  id: string;
  /** Position in the filtered list, 1-based, so it survives pagination. */
  index: number;
  /** Null when they answered without leaving one. */
  name: string | null;
  ambassador: string;
  submitted: string;
  email: string | null;
  phone: string | null;
  status: "valid" | "duplicate" | "flagged" | "rejected";
  flagReason: string | null;
  /** "Android · Instagram", or null when the browser sent nothing. */
  device: string | null;
  /** Other responses to this survey sharing a network, email or phone. */
  matches: { kind: string; names: string[] }[];
  answers: { questionId: string; prompt: string; answer: string }[];
  /** Duplicate / Flag / Restore, bound on the server. */
  actions: React.ReactNode;
};

const STATUS_TONE = {
  valid: "ok",
  duplicate: "warn",
  flagged: "warn",
  rejected: "bad",
} as const;

/** The person, before the answers. Headings and cells are built from one list. */
const DETAILS: {
  key: string;
  label: string;
  width: string;
  cell: (row: ResponseRow) => React.ReactNode;
}[] = [
  {
    key: "status",
    label: "Status",
    width: "min-w-[110px]",
    cell: (row) => (
      <Badge tone={STATUS_TONE[row.status]} dot>
        {row.status}
      </Badge>
    ),
  },
  {
    key: "ambassador",
    label: "Ambassador",
    width: "min-w-[150px]",
    cell: (row) => <Text value={row.ambassador} />,
  },
  {
    key: "submitted",
    label: "Submitted",
    width: "min-w-[150px]",
    cell: (row) => <Text value={row.submitted} />,
  },
  {
    key: "email",
    label: "Email",
    width: "min-w-[190px]",
    cell: (row) => <Text value={row.email} />,
  },
  {
    key: "phone",
    label: "Phone",
    width: "min-w-[130px]",
    cell: (row) => <Text value={row.phone} />,
  },
  {
    key: "device",
    label: "Device",
    width: "min-w-[150px]",
    cell: (row) => <Text value={row.device} />,
  },
  {
    key: "check",
    label: "Duplicate check",
    width: "min-w-[240px]",
    cell: (row) =>
      row.flagReason || row.matches.length > 0 ? (
        <div className="space-y-1">
          {row.flagReason && (
            <span
              title={row.flagReason}
              className="line-clamp-2 block text-[12.5px] leading-snug font-bold text-ink"
            >
              {row.flagReason}
            </span>
          )}
          {row.matches.map((match) => (
            <span
              key={match.kind}
              title={`${match.kind} as ${match.names.join(", ")}`}
              className="line-clamp-2 block text-[12px] leading-snug font-semibold text-ink-soft"
            >
              {match.kind} as {summarise(match.names)}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-[13px] font-semibold text-ink-faint">—</span>
      ),
  },
];

/** "Aryan, B lasya +3" — the full list is on hover and in the open row. */
function summarise(names: string[]): string {
  const shown = names.slice(0, 2).join(", ");
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown;
}

function Text({ value }: { value: string | null }) {
  return value ? (
    <span
      title={value}
      className="line-clamp-2 block text-[13px] leading-snug font-bold [overflow-wrap:anywhere] text-ink"
    >
      {value}
    </span>
  ) : (
    <span className="text-[13px] font-semibold text-ink-faint">—</span>
  );
}

export function ResponseTable({
  rows,
  questions,
}: {
  rows: ResponseRow[];
  questions: { id: string; prompt: string }[];
}) {
  const [open, setOpen] = React.useState<string | null>(null);

  // The scroller's visible width, which an opened row's panel is held to.
  const scroller = React.useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = React.useState(0);
  React.useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setViewport(element.clientWidth),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
      {/* The table scrolls sideways inside its own box. A survey with ten
          questions is genuinely wider than a laptop, and the alternative —
          shrinking every column until nothing is legible — is worse than
          scrolling. */}
      <div ref={scroller} className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[180px] bg-gray-50 px-3.5 py-2.5 align-bottom text-[11.5px] font-bold tracking-wide text-ink-faint uppercase"
              >
                Respondent
              </th>
              {DETAILS.map((detail) => (
                <th
                  key={detail.key}
                  scope="col"
                  className={cn(
                    detail.width,
                    "px-3.5 py-2.5 align-bottom text-[11.5px] font-bold tracking-wide text-ink-faint uppercase",
                  )}
                >
                  {detail.label}
                </th>
              ))}
              {questions.map((question, i) => (
                <th
                  key={question.id}
                  scope="col"
                  // The full prompt on hover: a two-line clamp is enough to
                  // tell the columns apart and never enough to read a long
                  // question in full.
                  title={question.prompt}
                  className="min-w-[190px] px-3.5 py-2.5 align-bottom text-[11.5px] font-bold tracking-wide text-ink-faint uppercase"
                >
                  <span className="line-clamp-2 block">
                    Q{i + 1} · {question.prompt}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const expanded = open === row.id;
              const byQuestion = new Map(
                row.answers.map((a) => [a.questionId, a.answer]),
              );

              return (
                <React.Fragment key={row.id}>
                  <tr
                    onClick={() => setOpen(expanded ? null : row.id)}
                    className={cn(
                      "cursor-pointer align-top transition-colors",
                      expanded ? "bg-brand-tint" : "hover:bg-gray-50",
                    )}
                  >
                    <th
                      scope="row"
                      className={cn(
                        "sticky left-0 z-10 px-3.5 py-3 text-left font-normal",
                        expanded ? "bg-brand-tint" : "bg-surface",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <ChevronRight
                          aria-hidden
                          className={cn(
                            "mt-0.5 size-3.5 shrink-0 text-ink-faint transition-transform",
                            expanded && "rotate-90",
                          )}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-extrabold text-ink">
                            {row.index}. {row.name || "Anonymous"}
                          </p>
                        </div>
                      </div>
                    </th>

                    {DETAILS.map((detail) => (
                      <td key={detail.key} className="px-3.5 py-3">
                        {detail.cell(row)}
                      </td>
                    ))}

                    {questions.map((question) => {
                      const answer = byQuestion.get(question.id);
                      const skipped = !answer || answer === "—";

                      return (
                        <td key={question.id} className="px-3.5 py-3">
                          <span
                            title={skipped ? undefined : answer}
                            className={cn(
                              "line-clamp-2 block text-[13px] leading-snug",
                              skipped
                                ? "font-semibold text-ink-faint"
                                : "font-bold text-ink",
                            )}
                          >
                            {skipped ? "—" : answer}
                          </span>
                        </td>
                      );
                    })}
                  </tr>

                  {expanded && (
                    <tr>
                      <td
                        colSpan={questions.length + DETAILS.length + 1}
                        className="bg-gray-50 p-0"
                      >
                        {/* Pinned to the visible part of the scroller. The
                            cell spans every column, so a plain panel inside
                            it starts at the table's left edge — scrolled
                            sideways to read Q6, the panel opened off-screen
                            and read as a stack of empty boxes. */}
                        <div
                          className="sticky left-0"
                          style={{ width: viewport || undefined }}
                        >
                          <ResponseDetail row={row} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One response, opened.
 *
 * The person on the left, their answers on the right. The answers are a grid
 * of cards rather than one long column: a five-question survey used to open
 * into a strip of wide, mostly-empty boxes, each holding a single digit.
 */
function ResponseDetail({ row }: { row: ResponseRow }) {
  const answered = row.answers.filter((a) => a.answer !== "—").length;

  const about = [
    { icon: UserRound, label: "Ambassador", value: row.ambassador },
    { icon: Clock, label: "Submitted", value: row.submitted },
    { icon: Mail, label: "Email", value: row.email },
    { icon: Phone, label: "Phone", value: row.phone },
    { icon: Smartphone, label: "Device", value: row.device },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="display truncate text-[18px] text-ink">
              {row.name || "Anonymous"}
            </h3>
            <Badge tone={STATUS_TONE[row.status]} dot>
              {row.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-[12.5px] font-semibold text-ink-soft">
            Response #{row.index} · answered {answered} of {row.answers.length}
          </p>
        </div>

        {/* Moderation lives behind the expander on purpose. Flagging reverses
            a point, and a destructive control on every row of a dense table
            is one mis-click away from doing it to the wrong person. */}
        <div
          className="flex flex-wrap items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          {row.actions}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-3">
          <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-surface">
            {about.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3 px-3.5 py-2.5">
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                <div className="min-w-0">
                  <dt className="text-[11px] font-bold tracking-wide text-ink-faint uppercase">
                    {label}
                  </dt>
                  <dd
                    className={cn(
                      "text-[13.5px] [overflow-wrap:anywhere]",
                      value ? "font-bold text-ink" : "font-semibold text-ink-faint",
                    )}
                  >
                    {value || "Not given"}
                  </dd>
                </div>
              </div>
            ))}
          </dl>

          {(row.flagReason || row.matches.length > 0) && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-wide text-amber-800 uppercase">
                <ShieldAlert aria-hidden className="size-4" />
                Duplicate check
              </p>
              {row.flagReason && (
                <p className="text-[13px] font-bold text-ink">{row.flagReason}</p>
              )}
              {row.matches.map((match) => (
                <p key={match.kind} className="text-[12.5px] font-semibold text-ink-soft">
                  {match.kind} as{" "}
                  <span className="font-bold text-ink">
                    {match.names.join(", ")}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>

        {answered === 0 ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-surface px-6 py-8 text-center">
            <p className="text-[14px] font-extrabold text-ink">No answers saved</p>
            <p className="mt-1 max-w-sm text-[12.5px] font-semibold text-ink-soft">
              {row.status === "duplicate"
                ? "Caught as a duplicate before duplicates kept their answers, so only the person's details were saved."
                : "Every question on this response was skipped."}
            </p>
          </div>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {row.answers.map((answer, i) => {
              const skipped = answer.answer === "—";
              return (
                <li
                  key={answer.questionId}
                  className="flex flex-col rounded-xl border border-gray-200 bg-surface px-3.5 py-3"
                >
                  <p className="text-[12px] leading-snug font-semibold text-ink-soft">
                    <span className="mr-1.5 rounded-md bg-brand-tint px-1.5 py-0.5 text-[11px] font-extrabold text-brand-strong">
                      Q{i + 1}
                    </span>
                    {answer.prompt}
                  </p>
                  <p
                    className={cn(
                      "mt-2 [overflow-wrap:anywhere]",
                      skipped
                        ? "text-[13px] font-semibold text-ink-faint italic"
                        : "text-[15px] leading-relaxed font-extrabold text-ink",
                    )}
                  >
                    {skipped ? "Skipped" : answer.answer}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
