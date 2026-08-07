"use client";

import * as React from "react";
import { ChevronRight, Mail, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Note } from "@/components/ui/feedback";
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

export function ResponseTable({
  rows,
  questions,
}: {
  rows: ResponseRow[];
  questions: { id: string; prompt: string }[];
}) {
  const [open, setOpen] = React.useState<string | null>(null);

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
                className="sticky left-0 z-10 min-w-[180px] bg-gray-50 px-3.5 py-2.5 text-[11.5px] font-bold tracking-wide text-ink-faint uppercase"
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
              <th
                scope="col"
                className="px-3.5 py-2.5 text-[11.5px] font-bold tracking-wide text-ink-faint uppercase"
              >
                Status
              </th>
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
                          <p className="truncate text-[11.5px] font-semibold text-ink-soft">
                            via {row.ambassador} · {row.submitted}
                          </p>
                        </div>
                      </div>
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

                    <td className="px-3.5 py-3">
                      <Badge tone={STATUS_TONE[row.status]} dot>
                        {row.status}
                      </Badge>
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="bg-brand-tint/40">
                      <td
                        colSpan={questions.length + 2}
                        className="px-3.5 pt-1 pb-4"
                      >
                        {/* Held to a readable measure rather than stretched to
                            the width of a ten-question table. */}
                        <div className="max-w-2xl space-y-3">
                          {(row.email || row.phone) && (
                            <div className="flex flex-wrap gap-2">
                              {row.email && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[12px] font-bold text-ink">
                                  <Mail className="size-3.5" />
                                  {row.email}
                                </span>
                              )}
                              {row.phone && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[12px] font-bold text-ink">
                                  <Phone className="size-3.5" />
                                  {row.phone}
                                </span>
                              )}
                            </div>
                          )}

                          {row.flagReason && (
                            <Note tone="warn">{row.flagReason}</Note>
                          )}

                          <dl className="space-y-2">
                            {row.answers.map((answer) => (
                              <div
                                key={answer.questionId}
                                className="rounded-lg bg-surface px-3.5 py-2.5"
                              >
                                <dt className="text-[11.5px] font-extrabold tracking-wide text-ink/70 uppercase">
                                  {answer.prompt}
                                </dt>
                                <dd
                                  className={
                                    answer.answer === "—"
                                      ? "mt-1 text-[13.5px] font-semibold text-ink-faint"
                                      : "mt-1 text-[14px] leading-relaxed font-bold text-ink"
                                  }
                                >
                                  {answer.answer === "—"
                                    ? "Skipped"
                                    : answer.answer}
                                </dd>
                              </div>
                            ))}
                          </dl>

                          {/* Moderation lives behind the expander on purpose.
                              Flagging reverses a point, and a destructive
                              control on every row of a dense table is one
                              mis-click away from doing it to the wrong
                              person. */}
                          <div
                            className="flex flex-wrap items-center gap-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {row.actions}
                          </div>
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
