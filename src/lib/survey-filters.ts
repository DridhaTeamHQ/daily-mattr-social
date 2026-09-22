/**
 * Per-question answer filters for a survey's response list.
 *
 * The search box answers "who mentioned X anywhere"; it cannot answer "show
 * me everyone who picked 1 on Q3", because the answer to one question is not
 * distinguishable from the same text in another. So each question gets its
 * own filter, and they combine: two filters means the responses that match
 * both, which is how "the people who rate us 5 and still never open the app"
 * gets asked.
 *
 * Deliberately plain code with no `server-only` and no `"use client"` — the
 * page filters on the server and the control renders on the client, and both
 * have to agree on what a filter means. See `src/lib/search.ts` for the same
 * reasoning.
 */

/** Matches a response that answered the question at all, whatever it said. */
export const ANSWERED = "~answered";

/** Matches a response that left the question blank. */
export const SKIPPED = "~skipped";

/**
 * The querystring parameter for the question in position `index`.
 *
 * Numbered by position rather than keyed by id: `?f3=5` is a URL somebody can
 * read and matches the "Q3" printed on the page, where a uuid per question
 * would be 36 characters of noise each. The cost is that reordering the
 * questions re-points an old bookmark, which is the right trade for a filter
 * that is used within a sitting.
 */
export function filterParam(index: number): string {
  return `f${index + 1}`;
}

/** The parts of a response a filter reads. */
export type FilterableResponse = {
  answers: { questionId: string; values: string[] }[];
};

/** One question's filter, as the page resolved it from the URL. */
export type ActiveFilter = {
  questionId: string;
  param: string;
  value: string;
};

function valuesFor(
  response: FilterableResponse,
  questionId: string,
): string[] {
  return response.answers.find((a) => a.questionId === questionId)?.values ?? [];
}

/** Whether one response satisfies one filter. */
export function answerMatches(
  response: FilterableResponse,
  questionId: string,
  value: string,
): boolean {
  const values = valuesFor(response, questionId);

  if (value === ANSWERED) return values.length > 0;
  if (value === SKIPPED) return values.length === 0;

  // `includes`, not equality: a multi-choice answer holds every selection the
  // respondent made, and filtering on one of them has to find the response
  // that also picked three others.
  return values.includes(value);
}

/**
 * Whether a response satisfies every active filter.
 *
 * `except` leaves one filter out, which is how each control counts its own
 * options: the number beside "Excellent" has to be what choosing it would
 * leave, so it must respect the other filters and ignore this one. Counting
 * with the filter applied would make every unchosen option read zero.
 */
export function matchesFilters(
  response: FilterableResponse,
  filters: ActiveFilter[],
  except?: string,
): boolean {
  return filters.every(
    (filter) =>
      filter.param === except ||
      answerMatches(response, filter.questionId, filter.value),
  );
}

/**
 * The distinct answers to one question, most common first.
 *
 * Built from the answers people actually gave rather than from the question's
 * stored options, so a choice nobody picked does not offer a filter that
 * returns nothing, and a free-text question — which has no stored options at
 * all — still gets a usable list when the answers repeat.
 */
export function answerOptions(
  responses: FilterableResponse[],
  questionId: string,
): { value: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const response of responses) {
    // A multi-choice response counts once per selection, but only once per
    // selection per response — picking the same option twice is not two
    // responses, and the count has to say how many rows choosing it leaves.
    for (const value of new Set(valuesFor(response, questionId))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Past this many distinct answers a dropdown stops being a filter and becomes
 * a list nobody can find anything in. Free-text questions run to one distinct
 * answer per response; those keep Answered / Skipped, and the search box above
 * the table is the way to find a phrase inside them.
 */
export const MAX_LISTED_ANSWERS = 30;
