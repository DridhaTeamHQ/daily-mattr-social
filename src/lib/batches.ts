/**
 * Batches, as one list.
 *
 * A batch is not a free-text field even though it was typed like one. It picks
 * the letter inside every referral code that ambassador will ever hand out, it
 * is the axis the batch-vs-batch numbers group on, and it appears on their
 * profile — so "Batch 2", "batch 2", "2" and "67" all arriving from the same
 * text box meant three groups for one batch and one code prefix nobody
 * intended.
 *
 * A plain module, not a "use server" one: those may export only async
 * functions, and a client component needs the list.
 */

import { batchLetter, NO_BATCH } from "@/lib/referral-code-shape";

/** How many batches the picker offers. Widen when the programme does. */
const COUNT = 12;

export const BATCH_OPTIONS: string[] = Array.from(
  { length: COUNT },
  (_, i) => `Batch ${String.fromCharCode(65 + i)}`,
);

/**
 * The stored form of whatever was typed or imported.
 *
 * Returns null for empty, so "no batch set" stays distinguishable from batch
 * A. A letter is kept as the letter; a number 1–26 becomes the letter in that
 * position, so a spreadsheet column that still says "2" lands on Batch B
 * instead of inventing a thirteenth kind of batch. Anything else is left
 * exactly as typed — silently rewriting an admin's "Batch 67" would be a lie
 * about their data, and the picker keeps showing it until somebody chooses.
 */
export function canonicalBatch(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return null;

  const letter = batchLetter(value);
  if (letter !== NO_BATCH) return `Batch ${letter}`;

  return value;
}

/** The three cities the programme runs in. Others are still allowed. */
export const CITY_OPTIONS = ["Hyderabad", "Vijayawada", "Warangal"] as const;

/**
 * Same idea for cities, minus the numbering. "hyderabad" and "Hyderabad " are
 * one city; "VIT" stays "VIT" rather than becoming "Vit".
 */
export function canonicalCity(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return null;

  const known = CITY_OPTIONS.find(
    (c) => c.toLowerCase() === value.toLowerCase(),
  );
  if (known) return known;

  return value
    .split(" ")
    .map((word) =>
      word === word.toLowerCase()
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word,
    )
    .join(" ");
}
