import { MessageSquareText } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import type { SurveyWithResponses } from "@/lib/admin/queries";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Per-question summary, the way Google Forms does it.
 *
 * A list of individual responses answers "what did this person say"; nobody
 * reads three hundred of them. The summary answers "what did people say",
 * which is the question a survey was run to answer in the first place.
 *
 * Choice questions become ranked bars. Free text stays a list, because
 * charting prose is how you end up with a bar chart of two hundred bars each
 * of height one.
 */

type Bucket = { label: string; count: number };

function bucketsFor(
  questionId: string,
  data: SurveyWithResponses,
): { buckets: Bucket[]; answered: number } {
  const counts = new Map<string, number>();
  let answered = 0;

  for (const response of data.responses) {
    // Only valid responses. A duplicate or a flagged one is exactly what an
    // admin flagged it as, and letting it into the totals defeats the flag.
    if (response.status !== "valid") continue;

    const answer = response.answers.find((a) => a.questionId === questionId);
    if (!answer || !answer.answer || answer.answer === "—") continue;

    answered += 1;

    // Multi-choice arrives already joined for display, so it splits back out
    // here — one respondent picking three options is three votes, not one
    // bucket labelled "a, b, c".
    for (const part of answer.answer.split(",").map((p) => p.trim())) {
      if (!part) continue;
      counts.set(part, (counts.get(part) ?? 0) + 1);
    }
  }

  return {
    answered,
    buckets: [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}

const CHART_TYPES = new Set([
  "single_choice",
  "multi_choice",
  "rating",
  "number",
]);

export function ResponseSummary({ data }: { data: SurveyWithResponses }) {
  if (data.questions.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-[13px] font-semibold text-ink-soft">
            This survey has no questions.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.questions.map((question, index) => {
        const { buckets, answered } = bucketsFor(question.id, data);
        const chartable = CHART_TYPES.has(question.type);
        const top = buckets[0]?.count ?? 0;

        return (
          <Card key={question.id}>
            <CardBody>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[11.5px] font-bold text-ink-faint">
                  Q{index + 1}
                </span>
                <h3 className="text-[15px] font-extrabold text-ink">
                  {question.prompt}
                </h3>
              </div>
              <p className="mt-1 text-[12px] font-semibold text-ink-soft">
                {formatNumber(answered)} response{answered === 1 ? "" : "s"}
                {question.max_select
                  ? ` · up to ${question.max_select} choices each`
                  : ""}
              </p>

              {answered === 0 ? (
                <p className="mt-4 text-[13px] font-semibold text-ink-faint">
                  Nobody has answered this one yet.
                </p>
              ) : chartable ? (
                <ul className="mt-4 space-y-2.5">
                  {buckets.map((bucket) => {
                    const share = answered > 0 ? bucket.count / answered : 0;
                    return (
                      <li key={bucket.label}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
                            {bucket.label}
                          </span>
                          <span className="tabular shrink-0 text-[12.5px] font-extrabold text-ink">
                            {bucket.count}
                            <span className="ml-1.5 font-bold text-ink-soft">
                              {Math.round(share * 100)}%
                            </span>
                          </span>
                        </div>
                        <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              // The most-picked answer is the one being looked
                              // for; the rest are context.
                              bucket.count === top ? "bg-brand" : "bg-blue-300",
                            )}
                            style={{
                              width: `${Math.max(2, (bucket.count / Math.max(1, top)) * 100)}%`,
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="mt-4 space-y-2">
                  {buckets.slice(0, 25).map((bucket) => (
                    <li
                      key={bucket.label}
                      className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                    >
                      <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
                      <span className="text-[13px] font-medium text-ink">
                        {bucket.label}
                      </span>
                      {bucket.count > 1 && (
                        <span className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-ink-soft">
                          ×{bucket.count}
                        </span>
                      )}
                    </li>
                  ))}
                  {buckets.length > 25 && (
                    <li className="text-[12px] font-semibold text-ink-soft">
                      {buckets.length - 25} more in the individual responses.
                    </li>
                  )}
                </ul>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
