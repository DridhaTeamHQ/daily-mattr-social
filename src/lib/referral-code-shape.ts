/**
 * Referral codes that mean something.
 *
 * A code is `DM` + the batch letter + a serial: batch A's first ambassador is
 * `DMA01`, then `DMA02`; batch B starts again at `DMB01`. Read one off a
 * poster or a support message and you know the batch without looking anything
 * up — which is the whole point, and the reason the letter is the letter
 * rather than its position in the alphabet.
 *
 * The serial is per batch, not global, so every batch starts at 01 — "which
 * person in this batch" stays true as batches grow at different rates.
 *
 * `0` stands in for a batch nobody has set. `DM001` is honest about being
 * unassigned instead of quietly claiming batch A.
 */

const PREFIX = "DM";

/** The stand-in when nobody has said which batch someone is in. */
export const NO_BATCH = "0";

/**
 * The character that goes in the code for a batch.
 *
 * Batches arrive typed as "Batch A", "A", "a", or imported from a spreadsheet
 * as "2", and all of them have to land somewhere predictable:
 *   - a letter wins, whatever the case ("Batch A" and "a" are both A)
 *   - a number 1–26 is read as its position, so a spreadsheet that still says
 *     "2" lands on B rather than being thrown away
 *   - anything else is NO_BATCH, which reads as "not set" rather than as A
 */
export function batchLetter(batch: string | null | undefined): string {
  // The word "batch" comes off FIRST. Without that, the letter rule below
  // reads the B in "Batch A" and every batch collapses to B.
  const value = (batch ?? "").replace(/batch/gi, " ").trim();
  if (!value) return NO_BATCH;

  const letter = value.match(/[a-z]/i);
  if (letter) return letter[0].toUpperCase();

  const digits = value.match(/\d+/);
  if (digits) {
    const n = Number(digits[0]);
    if (Number.isFinite(n) && n >= 1 && n <= 26) {
      return String.fromCharCode(64 + n);
    }
  }

  return NO_BATCH;
}

/**
 * True for codes that follow the scheme, so old random ones stay readable.
 *
 * One batch character, then at least two digits of serial. `DM54JGJ3` fails on
 * the letters in the serial, which is what keeps a legacy code identifiable as
 * legacy.
 */
export function isStructuredCode(code: string): boolean {
  return new RegExp(`^${PREFIX}[A-Z0]\\d{2,}$`).test(code);
}

/** The batch a structured code belongs to, or null for a legacy code. */
export function batchFromCode(code: string): string | null {
  if (!isStructuredCode(code)) return null;
  const key = code.charAt(PREFIX.length);
  return key === NO_BATCH ? null : key;
}

/**
 * How a hand-typed code is stored.
 *
 * `/r/[code]` upper-cases whatever arrives before looking it up, so a code
 * saved in lower case is a code no link can ever resolve. Normalising on the
 * way in is what stops an admin typing `dmb18` from silently creating a
 * dead link.
 */
export function normalizeCode(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

/** The longest code the redirect will look at — it slices to this. */
const MAX_LENGTH = 32;
const MIN_LENGTH = 4;

/**
 * Why a code cannot be used, or null when it is fine.
 *
 * Shared by the dialog and the action deliberately: the field can say what is
 * wrong as it is typed, and the server still refuses the same things when the
 * form is posted anyway. Assumes an already-normalised code.
 */
export function codeProblem(code: string): string | null {
  if (!code) return "A referral code is required.";
  if (!/^[A-Z0-9]+$/.test(code)) {
    return "Letters and digits only — it has to survive being in a URL.";
  }
  if (code.length < MIN_LENGTH) {
    return `Too short — ${MIN_LENGTH} characters at least.`;
  }
  if (code.length > MAX_LENGTH) {
    return `Too long — ${MAX_LENGTH} characters at most.`;
  }
  return null;
}
