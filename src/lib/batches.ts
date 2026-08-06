/**
 * Batches, as one list.
 *
 * A batch is not a free-text field even though it was typed like one. It picks
 * the digit inside every referral code that ambassador will ever hand out, it
 * is the axis the batch-vs-batch numbers group on, and it appears on their
 * profile — so "Batch 2", "batch 2", "2" and "67" all arriving from the same
 * text box meant three groups for one batch and one code prefix nobody
 * intended.
 *
 * A plain module, not a "use server" one: those may export only async
 * functions, and a client component needs the list.
 */

/** How many batches the picker offers. Widen when the programme does. */
const COUNT = 12;

export const BATCH_OPTIONS: string[] = Array.from(
  { length: COUNT },
  (_, i) => `Batch ${i + 1}`,
);

/**
 * The stored form of whatever was typed or imported.
 *
 * Returns null for empty, so "no batch set" stays distinguishable from batch
 * zero. Anything with a number keeps that number; anything else keeps its
 * letter, because "Batch A" is a real thing an admin writes and silently
 * turning it into "Batch 1" would be a lie about their data.
 */
export function canonicalBatch(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return null;

  const digits = value.match(/\d+/);
  if (digits) return `Batch ${Number(digits[0])}`;

  const letter = value.replace(/batch/gi, " ").trim().match(/[a-z]/i);
  if (letter) return `Batch ${letter[0].toUpperCase()}`;

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
