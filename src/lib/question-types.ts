import type { Enums } from "@/lib/database.types";

/**
 * The question types, as an admin sees them.
 *
 * Shared by the builder and the editor so a type cannot be called "Pick one"
 * on one screen and something else on the other — and so adding a type later
 * is one edit rather than two that drift.
 */
export const QUESTION_TYPES: {
  value: Enums<"question_type">;
  label: string;
  hint: string;
  hasOptions?: boolean;
}[] = [
  { value: "short_text", label: "Short text", hint: "One line" },
  { value: "long_text", label: "Paragraph", hint: "A few sentences" },
  { value: "single_choice", label: "Pick one", hint: "Radio buttons", hasOptions: true },
  { value: "multi_choice", label: "Pick many", hint: "Checkboxes", hasOptions: true },
  { value: "rating", label: "Rating", hint: "1 to 5" },
  { value: "number", label: "Number", hint: "Digits only" },
  { value: "email", label: "Email", hint: "Validated" },
  { value: "phone", label: "Phone", hint: "Validated" },
];

/** Whether a type carries a list of choices. */
export function typeHasOptions(type: string): boolean {
  return type === "single_choice" || type === "multi_choice";
}

/**
 * What a type keeps in the shared `options` column: a list of choices, the
 * meaning of each point on a scale, or nothing. Two types can pass a list
 * between them only when they agree on what it is.
 */
export function optionFamily(type: string): "choice" | "rating" | "none" {
  if (typeHasOptions(type)) return "choice";
  return type === "rating" ? "rating" : "none";
}

/** How many points a rating question offers. */
export const RATING_SCALE = 5;

/**
 * What the five numbers mean unless the admin says otherwise.
 *
 * A bare 1-to-5 is not a scale, it is a guess: one person's 3 is "fine" and
 * the next person's 3 is "disappointing", and the average treats them as the
 * same answer. Every rating starts named, and every name is editable.
 */
export const DEFAULT_RATING_LABELS = [
  "Bad",
  "Fair",
  "Good",
  "Very good",
  "Excellent",
];

/**
 * What each point on a rating scale means, in the admin's own words.
 *
 * Kept in the question's `options` column, one entry per point, index 0 being
 * 1 — a rating question has no choices of its own, so the column was empty and
 * a migration on a live table would have bought nothing. Position carries the
 * meaning, so blanks are preserved rather than filtered out: labelling only
 * the two ends is the common case, and dropping the empty middle would slide
 * "Always" from 5 down to 2.
 *
 * Always returns exactly RATING_SCALE entries, so a question saved before
 * labels existed still fills five boxes instead of crashing on `labels[3]`.
 */
export function ratingLabelSlots(options: unknown): string[] {
  const stored = Array.isArray(options) ? options : [];
  const slots = Array.from({ length: RATING_SCALE }, (_, i) =>
    typeof stored[i] === "string" ? (stored[i] as string) : "",
  );

  // Nothing stored at all — every rating written before labels existed, and
  // every new one until the admin types over them — reads as the defaults.
  return slots.some((slot) => slot.trim()) ? slots : [...DEFAULT_RATING_LABELS];
}

/**
 * The same five, trimmed, as a respondent sees them.
 *
 * Separate from the slots because the editor must not trim: doing it on every
 * keystroke makes the space bar look broken halfway through "Not very often".
 */
export function ratingLabels(options: unknown): string[] {
  return ratingLabelSlots(options).map((label) => label.trim());
}

/**
 * The same five, ready to store.
 *
 * Empties out only if every slot was blank, which cannot happen through the
 * form — clearing all five is read as "use the defaults" and writes them in.
 * Clearing one box still leaves that one point unnamed, since the other four
 * prove the blank was meant.
 */
export function normalizeRatingLabels(options: unknown): string[] {
  const labels = ratingLabels(options);
  return labels.some(Boolean) ? labels : [];
}

/**
 * The choices of a choice question, with their pictures still attached.
 *
 * A choice counts as real if it has words, a picture, or both. Only a row
 * with neither falls out — which is every row the builder starts with, since
 * a fresh choice question opens with two empty boxes.
 *
 * ─── Why the two lists are filtered in one pass ────────────────────────
 *
 * `option_images[i]` illustrates `options[i]`, so dropping a row from one
 * list and not the other slides every picture below it onto the wrong choice:
 *
 *   labels ["Red", "", "Blue"]  images [r, x, b]
 *   separately → ["Red","Blue"] + [r, x]   → Blue wears the dropped picture
 *   together   → ["Red","Blue"] + [r, b]   → each keeps its own
 *
 * ─── Why a picture-only choice still gets a name ──────────────────────
 *
 * The label is not decoration: an answer is written into
 * `survey_answers.value` as the label itself, the responses table counts by
 * matching those strings and the CSV exports them. A choice stored as `""`
 * would record every pick as an empty cell, and two of them would be
 * indistinguishable from each other for ever.
 *
 * So a choice with a picture and no words is given one — `Option 3`, by its
 * position — rather than being refused. The admin sees a real name in the
 * results, the respondent sees the picture, and nothing downstream has to
 * learn about a nameless answer. A generated name never collides with a typed
 * one: the typed labels are claimed first and the counter steps past them.
 */
export function choiceOptions(
  options: string[] | undefined,
  images: (string | null)[] | undefined,
): { labels: string[]; images: (string | null)[] } {
  const pairs = (options ?? []).map(
    (label, index) => [label.trim(), images?.[index] ?? null] as const,
  );
  const kept = pairs.filter(([label, image]) => label.length > 0 || image !== null);

  const taken = new Set(kept.map(([label]) => label).filter(Boolean));
  const labels = kept.map(([label], index) => {
    if (label) return label;

    let counter = index + 1;
    let name = `Option ${counter}`;
    // Only ever runs when somebody has typed "Option 3" by hand and given a
    // different choice a picture and no words.
    while (taken.has(name)) name = `Option ${++counter}`;
    taken.add(name);
    return name;
  });

  const next = kept.map(([, image]) => image);
  // A question whose pictures were all removed stores `[]` rather than a row
  // of nulls; every reader treats a missing entry as "no picture" anyway.
  while (next.length > 0 && next[next.length - 1] === null) next.pop();

  return { labels, images: next };
}
