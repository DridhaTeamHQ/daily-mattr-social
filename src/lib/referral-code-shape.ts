/**
 * Referral codes that mean something.
 *
 * A code is `DM` + the batch number + a serial: batch 2's first ambassador is
 * `DM201`, then `DM202`. Read one off a poster or a support message and you
 * already know which batch it belongs to, without looking anything up.
 *
 * The serial is per batch, not global, so batch 3 also starts at 01 — the
 * number after the batch digit is "which person in this batch", which is the
 * only reading that stays true as batches grow at different rates.
 */

const PREFIX = "DM";

/**
 * Turns a free-text batch into the digit that goes in the code.
 *
 * Batches get typed as "Batch 2", "2", "Batch A" or left empty, and all four
 * have to land somewhere predictable:
 *   - a number anywhere in the string wins ("Batch 2" and "2" are both 2)
 *   - otherwise a leading letter is its position ("Batch A" is 1)
 *   - otherwise 0, which reads as "no batch set" rather than as batch 1
 */
export function batchKey(batch: string | null | undefined): number {
  // The word "batch" comes off FIRST. Without that, the letter rule below
  // reads the B in "Batch A" and every batch that is named rather than
  // numbered collapses to 2.
  const value = (batch ?? "").replace(/batch/gi, " ").trim();
  if (!value) return 0;

  const digits = value.match(/\d+/);
  if (digits) {
    const n = Number(digits[0]);
    // Two digits is plenty of batches; beyond that the code stops being
    // short enough to read off a poster, which is the point of it. A number
    // out of range is usually a year ("2026-A"), so fall through to the
    // letter rather than silently answering 0.
    if (Number.isFinite(n) && n >= 0 && n <= 99) return n;
  }

  const letter = value.match(/[a-z]/i);
  if (letter) return letter[0].toUpperCase().charCodeAt(0) - 64;

  return 0;
}

/** True for codes that follow the scheme, so old random ones stay readable. */
export function isStructuredCode(code: string): boolean {
  return new RegExp(`^${PREFIX}\\d{3,}$`).test(code);
}

/** The batch a structured code belongs to, or null for a legacy code. */
export function batchFromCode(code: string): number | null {
  if (!isStructuredCode(code)) return null;
  const digits = code.slice(PREFIX.length);
  // Everything but the two-digit serial is the batch.
  return Number(digits.slice(0, digits.length - 2));
}
