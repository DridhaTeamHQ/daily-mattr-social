import type { Enums } from "@/lib/database.types";

/**
 * Deterministic screenshot checks, and the decision they feed.
 *
 * Kept apart from the upload action so the rules are legible in one place and
 * can be reasoned about without reading storage and database plumbing.
 *
 * The governing principle: **nothing here auto-rejects.** A failed check sends
 * the submission to a human, it does not accuse a student. Rejecting a real
 * screenshot costs an ambassador their work and their trust; sending a fake one
 * to review costs an admin fifteen seconds.
 */

export type CheckResults = Record<string, boolean | string | number>;

export type ImageFactsInput = {
  width: number | null;
  height: number | null;
  byteSize: number;
  mimeType: string;
  capturedAt: string | null;
};

export type DuplicateInput = {
  /** Another submission, by anyone, with byte-identical content. */
  exactMatch: boolean;
  /** Closest perceptual distance to a submission by a DIFFERENT ambassador. */
  nearestDistance: number | null;
  rejectDistance: number;
};

export function runChecks(
  facts: ImageFactsInput,
  duplicates: DuplicateInput,
): CheckResults {
  const checks: CheckResults = {};

  // A phone screenshot is portrait. Landscape isn't proof of anything — it
  // might be a tablet or a desktop — so it's recorded, not weighted heavily.
  if (facts.width && facts.height) {
    checks.portrait = facts.height > facts.width;
    checks.dimensions = `${facts.width}x${facts.height}`;
  }

  // Phone screenshots are rarely under 40kB. A tiny file is usually a
  // thumbnail someone saved from a chat, which has already lost the detail a
  // reviewer needs.
  checks.full_size_image = facts.byteSize > 40_000;

  checks.unique_image = !duplicates.exactMatch;

  if (duplicates.nearestDistance !== null) {
    checks.not_reused = duplicates.nearestDistance > duplicates.rejectDistance;
    checks.closest_match_distance = duplicates.nearestDistance;
  } else {
    checks.not_reused = true;
  }

  // Absence of EXIF is normal, not suspicious: phone screenshots usually carry
  // none, and anything sent through a chat app has had it stripped. Recorded
  // for the reviewer, never counted as a failure.
  checks.has_capture_time = facts.capturedAt !== null;

  return checks;
}

/**
 * The checks that actually gate auto-approval.
 *
 * Exported because the review queue needs to tell a reviewer which failures
 * matter. `portrait` and `has_capture_time` are recorded for context and were
 * never meant to gate anything — a desktop screenshot is landscape, and phone
 * screenshots routinely carry no EXIF. Presenting those as "failed checks"
 * makes a perfectly good submission look suspicious.
 */
export const BLOCKING_CHECKS = [
  "unique_image",
  "not_reused",
  "full_size_image",
] as const;

const BLOCKING = BLOCKING_CHECKS;

export function blockingFailures(checks: CheckResults): string[] {
  return BLOCKING.filter((key) => checks[key] === false);
}

export type Decision = {
  status: Enums<"submission_status">;
  /** Shown to the admin in the queue, and to the student where relevant. */
  reason: string;
};

/**
 * Turns the checks and the optional AI verdict into a status.
 *
 * Auto-approval needs everything to line up: no blocking failure, AI enabled
 * and confident. Anything short of that is a human's call — which is also what
 * happens when no `OPENAI_API_KEY` is set, so the whole feature degrades to
 * "every upload is reviewed" rather than breaking.
 */
export function decide(
  checks: CheckResults,
  ai: { confidence: number; matches: boolean } | null,
  autoApproveMin: number,
): Decision {
  const failures = blockingFailures(checks);

  if (failures.includes("unique_image")) {
    return {
      status: "needs_review",
      reason: "This exact image has already been submitted.",
    };
  }

  if (failures.includes("not_reused")) {
    return {
      status: "needs_review",
      reason:
        "Nearly identical to a screenshot from another ambassador. Needs a look.",
    };
  }

  if (failures.length > 0) {
    return { status: "needs_review", reason: "Automated checks were unsure." };
  }

  if (!ai) {
    return {
      status: "needs_review",
      reason: "AI verification is off, so a human checks every upload.",
    };
  }

  if (ai.matches && ai.confidence >= autoApproveMin) {
    return { status: "auto_approved", reason: "Verified automatically." };
  }

  return {
    status: "needs_review",
    reason: ai.matches
      ? "Looks right, but not confidently enough to approve on its own."
      : "The screenshot didn't clearly show the task being completed.",
  };
}
