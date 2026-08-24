import { MessageSquareText } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import type { SurveyWithResponses } from "@/lib/admin/queries";
import { ratingLabels } from "@/lib/question-types";
import { formatNumber } from "@/lib/utils";

/**
 * Per-question results, as charts.
 *
 * A list of individual responses answers "what did this person say"; nobody
 * reads three hundred of them. This answers "what did people say", which is
 * the question the survey was run for.
 *
 * The previous version was one full-width bar list per question, stacked. With
 * eight questions that is a page you scroll rather than read, and every
 * question looked identical whatever it asked. So the form follows the
 * question now:
 *
 *   one answer each      → a donut, because the parts make a whole
 *   several answers each → bars, because they do not (percentages exceed 100)
 *   1–5 rating           → a column per point, in order, with the average
 *   free text            → still a list, since charting prose gives you two
 *                          hundred bars of height one
 *
 * Two per row on a desktop, so eight questions is one screen instead of eight.
 */

type Bucket = { label: string; count: number };

/**
 * Categorical colours, in fixed order, never cycled.
 *
 * Darker steps of the app's own accents: the bright UI versions are tuned for
 * large fills behind black text and fail as small chart marks. Assignment is
 * by position in the ranked list and stays put, so a legend read once holds
 * for the whole chart.
 */
const SERIES = [
  "#2d67e8",
  "#0f9d58",
  "#c2610a",
  "#6d4aff",
  "#0891b2",
  "#b45309",
  "#0b7285",
  "#7a3ea1",
];

/** Anything past the palette folds into one honest bucket. */
const MAX_SLICES = SERIES.length;

function bucketsFor(
  questionId: string,
  data: SurveyWithResponses,
): { buckets: Bucket[]; answered: number; votes: number } {
  const counts = new Map<string, number>();
  let answered = 0;
  let votes = 0;

  for (const response of data.responses) {
    // Only valid responses. A duplicate or a flagged one is exactly what an
    // admin flagged it as, and letting it into the totals defeats the flag.
    if (response.status !== "valid") continue;

    const answer = response.answers.find((a) => a.questionId === questionId);
    if (!answer || answer.values.length === 0) continue;

    answered += 1;

    // One vote per selection the respondent actually made. These arrive as
    // separate entries and are never derived by splitting the display string:
    // option labels contain commas ("Social Media (Instagram, X, Reddit,
    // Facebook, Whatsapp)"), and splitting on them invented five options that
    // each inherited the real one's count.
    for (const part of answer.values) {
      counts.set(part, (counts.get(part) ?? 0) + 1);
      votes += 1;
    }
  }

  return {
    answered,
    votes,
    buckets: [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}

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
    <div className="grid gap-4 lg:grid-cols-2">
      {data.questions.map((question, index) => {
        const { buckets, answered, votes } = bucketsFor(question.id, data);

        return (
          <Card key={question.id}>
            <CardBody>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[11.5px] font-bold text-ink-faint">
                  Q{index + 1}
                </span>
                <h3 className="text-[15px] leading-snug font-extrabold text-ink">
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
              ) : question.type === "rating" ? (
                <RatingChart
                  buckets={buckets}
                  answered={answered}
                  labels={ratingLabels(question.options)}
                />
              ) : question.type === "single_choice" ? (
                <DonutChart buckets={buckets} total={votes} />
              ) : question.type === "multi_choice" ||
                question.type === "number" ? (
                <BarChart buckets={buckets} answered={answered} />
              ) : (
                <TextAnswers buckets={buckets} />
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * One answer each, so the slices make a whole.
 *
 * A donut rather than a pie: the hole carries the total, which is the number
 * every other figure on the card is a share of, and putting it there means it
 * never has to be read off a caption.
 */
function DonutChart({ buckets, total }: { buckets: Bucket[]; total: number }) {
  const slices = fold(buckets);

  // 2πr for r=54. Every arc is drawn as a dash of the right length on the
  // same circle, which is what makes them meet exactly.
  const R = 54;
  const C = 2 * Math.PI * R;

  // Offsets computed up front rather than accumulated inside the map: a
  // counter mutated during render is exactly what the compiler rejects, and
  // it would be wrong the moment React rendered the list twice.
  const arcs = slices.reduce<{ slice: Bucket; dash: number; offset: number }[]>(
    (acc, slice) => {
      const previous = acc[acc.length - 1];
      const dash = (total > 0 ? slice.count / total : 0) * C;
      acc.push({
        slice,
        dash,
        offset: previous ? previous.offset + previous.dash : 0,
      });
      return acc;
    },
    [],
  );

  return (
    <div className="mt-4 flex flex-wrap items-center gap-5">
      <svg width="132" height="132" viewBox="0 0 132 132" className="shrink-0">
        <g transform="rotate(-90 66 66)">
          {arcs.map((arc, i) => (
            <circle
              key={arc.slice.label}
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke={SERIES[i % SERIES.length]}
              strokeWidth="20"
              strokeDasharray={`${arc.dash} ${C - arc.dash}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </g>
        <text
          x="66"
          y="62"
          textAnchor="middle"
          className="fill-ink text-[22px] font-black"
        >
          {formatNumber(total)}
        </text>
        <text
          x="66"
          y="80"
          textAnchor="middle"
          className="fill-ink-soft text-[10px] font-bold"
        >
          answers
        </text>
      </svg>

      <Legend slices={slices} total={total} />
    </div>
  );
}

/** Several answers each, so shares are of respondents and can exceed 100%. */
function BarChart({
  buckets,
  answered,
}: {
  buckets: Bucket[];
  answered: number;
}) {
  const top = buckets[0]?.count ?? 1;

  return (
    <ul className="mt-4 space-y-2.5">
      {fold(buckets).map((bucket, i) => (
        <li key={bucket.label}>
          <div className="flex items-baseline justify-between gap-3">
            {/* Wraps rather than truncates. An option label is the only thing
                identifying its bar, and these run long — "Social Media
                (Instagram, X, Reddit, Facebook, Whatsapp)" ends at "Social
                Media (Instagra…" in one line, which names nothing. */}
            <span className="min-w-0 flex-1 text-[13px] leading-snug font-bold text-ink">
              {bucket.label}
            </span>
            <span className="tabular shrink-0 text-[12.5px] font-extrabold text-ink">
              {bucket.count}
              <span className="ml-1.5 font-bold text-ink-soft">
                {Math.round((bucket.count / Math.max(1, answered)) * 100)}%
              </span>
            </span>
          </div>
          <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (bucket.count / top) * 100)}%`,
                background: SERIES[i % SERIES.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * A 1–5 scale, in scale order rather than ranked.
 *
 * Sorting a rating by popularity destroys the only thing it has to say: 1 and
 * 5 next to each other is a split, 4 and 5 next to each other is agreement,
 * and a ranked list hides the difference.
 */
function RatingChart({
  buckets,
  answered,
  labels,
}: {
  buckets: Bucket[];
  answered: number;
  /** What the survey told respondents each number meant. Blank where it didn't. */
  labels: string[];
}) {
  const byValue = new Map(buckets.map((b) => [b.label.trim(), b.count]));
  const points = [1, 2, 3, 4, 5].map((n) => ({
    n,
    // Answers arrive as "4" or "4 out of 5" depending on how they were saved.
    count: byValue.get(String(n)) ?? byValue.get(`${n} out of 5`) ?? 0,
  }));

  const tallest = Math.max(1, ...points.map((p) => p.count));
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const average =
    total > 0
      ? points.reduce((sum, p) => sum + p.n * p.count, 0) / total
      : 0;

  return (
    <div className="mt-4">
      {/* A minimum, not a height: the columns carry the scale's wording under
          the number when the survey named it, and a fixed box clipped it. */}
      <div className="flex items-end gap-2" style={{ minHeight: 96 }}>
        {points.map((point) => (
          <div key={point.n} className="flex flex-1 flex-col items-center gap-1">
            <span className="tabular text-[11.5px] font-extrabold text-ink">
              {point.count || ""}
            </span>
            <div
              className="w-full rounded-t-md bg-brand-strong"
              style={{
                height: `${Math.max(2, (point.count / tallest) * 68)}px`,
                opacity: point.count === 0 ? 0.18 : 1,
              }}
            />
            <span className="text-[11.5px] font-bold text-ink-soft">
              {point.n}
            </span>

            {/* The wording respondents saw, so an average of 3.8 can be read
                without opening the survey to remember what 4 was called. */}
            {labels[point.n - 1] && (
              <span
                title={labels[point.n - 1]}
                className="line-clamp-2 text-center text-[10.5px] leading-tight font-semibold text-ink-faint"
              >
                {labels[point.n - 1]}
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[12.5px] font-semibold text-ink-soft">
        Average{" "}
        <strong className="tabular text-ink">{average.toFixed(1)}</strong> out
        of 5 · {formatNumber(answered)} rated
      </p>
    </div>
  );
}

/** Prose. Charting it would give two hundred bars of height one. */
function TextAnswers({ buckets }: { buckets: Bucket[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {buckets.slice(0, 12).map((bucket) => (
        <li
          key={bucket.label}
          className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
        >
          <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
          <span className="text-[13px] leading-snug font-medium text-ink">
            {bucket.label}
          </span>
          {bucket.count > 1 && (
            <span className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-ink-soft">
              ×{bucket.count}
            </span>
          )}
        </li>
      ))}
      {buckets.length > 12 && (
        <li className="text-[12px] font-semibold text-ink-soft">
          {buckets.length - 12} more in the individual responses.
        </li>
      )}
    </ul>
  );
}

/**
 * The key beside the donut.
 *
 * Always present, and every entry carries its own number — identity never
 * depends on telling two colours apart, which is the failure mode a legend is
 * supposed to prevent rather than cause.
 */
function Legend({ slices, total }: { slices: Bucket[]; total: number }) {
  return (
    <ul className="min-w-0 flex-1 space-y-1.5">
      {slices.map((slice, i) => (
        <li key={slice.label} className="flex items-baseline gap-2">
          <span
            aria-hidden
            className="mt-1 size-2.5 shrink-0 rounded-full"
            style={{ background: SERIES[i % SERIES.length] }}
          />
          <span className="min-w-0 flex-1 text-[13px] leading-snug font-bold text-ink">
            {slice.label}
          </span>
          <span className="tabular shrink-0 text-[12.5px] font-extrabold text-ink">
            {slice.count}
            <span className="ml-1.5 font-bold text-ink-soft">
              {Math.round((slice.count / Math.max(1, total)) * 100)}%
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Everything past the palette becomes one "Other".
 *
 * A ninth colour would have to be generated, and a generated hue is the point
 * at which a categorical palette stops being readable. One honest bucket beats
 * two slices nobody can tell apart.
 */
function fold(buckets: Bucket[]): Bucket[] {
  if (buckets.length <= MAX_SLICES) return buckets;

  const kept = buckets.slice(0, MAX_SLICES - 1);
  const rest = buckets.slice(MAX_SLICES - 1);
  return [
    ...kept,
    {
      label: `Other (${rest.length})`,
      count: rest.reduce((sum, b) => sum + b.count, 0),
    },
  ];
}
