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
 * labels existed renders as a plain 1-to-5 scale instead of crashing on
 * `labels[3]`.
 */
export function ratingLabelSlots(options: unknown): string[] {
  const stored = Array.isArray(options) ? options : [];
  return Array.from({ length: RATING_SCALE }, (_, i) =>
    typeof stored[i] === "string" ? (stored[i] as string) : "",
  );
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

/** The same five slots, ready to store — or nothing at all if none are used. */
export function normalizeRatingLabels(options: unknown): string[] {
  const labels = ratingLabels(options);
  return labels.some(Boolean) ? labels : [];
}
