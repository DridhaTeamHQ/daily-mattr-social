"use client";

import * as React from "react";

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
 * and the whole page fits on a screen. Cells clamp to two lines, with the
 * full text on hover. Rows used to open into a panel, but it only repeated
 * what the row already showed, so the moderation controls now sit in the
 * row's last column instead.
 *
 * The answers come first, right after the name — they are what this page is
 * read for. Everything known about the person follows: status, who brought
 * them in, when, their email and who else they share a network,
 * email or phone with, so deciding whether a row is a duplicate still never
 * means opening it.
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
  status: "valid" | "duplicate" | "flagged" | "rejected";
  flagReason: string | null;
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

/** The person, after the answers. Headings and cells are built from one list. */
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
  {
    // Every one of these opens a confirmation first, so living in the row
    // rather than behind an expander does not make them a one-click mistake.
    key: "actions",
    label: "Actions",
    width: "min-w-[200px]",
    cell: (row) => <div className="flex flex-wrap gap-2">{row.actions}</div>,
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
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
      {/* The table scrolls sideways inside its own box. A survey with ten
          questions is genuinely wider than a laptop, and the alternative —
          shrinking every column until nothing is legible — is worse than
          scrolling. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[180px] bg-gray-50 px-3.5 py-2.5 align-bottom text-[11.5px] font-bold tracking-wide text-ink-faint uppercase"
              >
                Respondent
              </th>
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
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const byQuestion = new Map(
                row.answers.map((a) => [a.questionId, a.answer]),
              );

              return (
                <tr key={row.id} className="group align-top transition-colors hover:bg-gray-50">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-3.5 py-3 text-left font-normal group-hover:bg-gray-50"
                  >
                    <p
                      title={row.name || undefined}
                      className="truncate text-[13.5px] font-extrabold text-ink"
                    >
                      {row.index}. {row.name || "Anonymous"}
                    </p>
                  </th>

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

                  {DETAILS.map((detail) => (
                    <td key={detail.key} className="px-3.5 py-3">
                      {detail.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
