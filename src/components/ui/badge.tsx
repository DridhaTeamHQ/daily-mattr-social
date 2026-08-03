import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "ok" | "warn" | "bad";

const TONES: Record<Tone, string> = {
  neutral: "bg-canvas-sunk text-ink-soft border-line",
  brand: "bg-brand-tint text-brand-press border-brand-line",
  ok: "bg-ok-tint text-ok border-ok-line",
  warn: "bg-warn-tint text-warn border-warn-line",
  bad: "bg-bad-tint text-bad border-bad-line",
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
        "inline-flex items-center gap-1.5 rounded-xs border px-2 py-0.5",
        "text-[12px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      )}
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
