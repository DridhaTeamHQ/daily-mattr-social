import "server-only";

/**
 * Whether an ambassador may submit for a task at all.
 *
 * Two separate rules, and one place for both so the screenshot path and the
 * link/text path cannot drift apart — they are the same promise made to the
 * same person about the same task.
 *
 *  · One open submission at a time. A second upload while the first is still
 *    waiting is the same work twice in the review queue.
 *
 *  · A rejection is final. A task gets one shot: the reviewer looked at the
 *    proof and said no, and re-uploading turns that decision into the opening
 *    move of a negotiation. An admin can still put it right — reversing a
 *    rejection is their call to make, not something the student can force by
 *    sending the picture again.
 *
 * A revoked approval is deliberately not final. That is credit taken back
 * after the fact, usually because the same image turned up twice, and the
 * ambassador has never been told what correct proof would look like.
 */

export type PriorSubmission = { status: string };

export const REJECTED_IS_FINAL =
  "This task was reviewed and turned down, and each task gets one submission. Read the reason on the task — if you think it's wrong, message an admin.";

const ALREADY_OPEN =
  "You've already submitted this one. Check its status on the task.";

/**
 * The sentence to refuse with, or null when the submission may go through.
 *
 * Takes every prior attempt for the one task by the one ambassador.
 */
export function submissionBlockedReason(
  previous: PriorSubmission[],
): string | null {
  const open = previous.find(
    (s) => s.status !== "rejected" && s.status !== "revoked",
  );
  if (open) return ALREADY_OPEN;

  if (previous.some((s) => s.status === "rejected")) return REJECTED_IS_FINAL;

  return null;
}
