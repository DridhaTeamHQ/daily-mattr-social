import * as React from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "neutral"
  | "brand"
  | "ok"
  | "warn"
  | "bad"
  | "reel"
  | "poll"
  | "invite"
  | "rank";

/**
 * Every badge is a light fill with black text and a black outline. Uniform by
 * design: the colour carries the category, the outline carries the style, and
 * contrast never needs checking pair by pair.
 */
const TONES: Record<Tone, string> = {
  neutral: "bg-canvas-sunk",
  brand: "bg-brand",
  ok: "bg-ok-tint",
  warn: "bg-warn-tint",
  bad: "bg-bad-tint",
  reel: "bg-reel-tint",
  poll: "bg-poll-tint",
  invite: "bg-invite-tint",
  rank: "bg-rank-tint",
};

export function Badge({
  tone = "neutral",
  className,
  dot = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs border-2 border-ink px-2 py-0.5",
        "text-[12px] font-extrabold text-ink whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-2 rounded-full bg-ink" aria-hidden />}
      {children}
    </span>
  );
}

/**
 * Submission status is the most-read piece of state in the whole product —
 * it appears in the ambassador's task list and in the admin review queue, and
 * the two must never disagree. Single source of truth for its presentation.
 */
export const SUBMISSION_STATUS: Record<
  string,
  { label: string; tone: Tone; help: string }
> = {
  pending: {
    label: "Checking",
    tone: "neutral",
    help: "We're verifying your screenshot.",
  },
  auto_approved: {
    label: "Approved",
    tone: "ok",
    help: "Verified automatically. Points credited.",
  },
  approved: {
    label: "Approved",
    tone: "ok",
    help: "Verified by our team. Points credited.",
  },
  needs_review: {
    label: "In review",
    tone: "warn",
    help: "A human is taking a look. This usually takes under a day.",
  },
  rejected: {
    label: "Rejected",
    tone: "bad",
    help: "This screenshot didn't pass verification.",
  },
  revoked: {
    label: "Revoked",
    tone: "bad",
    help: "Previously approved, then reversed. Points removed.",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = SUBMISSION_STATUS[status] ?? {
    label: status,
    tone: "neutral" as Tone,
  };
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}
