import * as React from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
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
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1",
        "text-[12px] font-bold whitespace-nowrap",
        tone === "brand" ? "text-white" : "text-ink",
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
  { label: string; tone: Tone; help: string; icon?: React.ComponentType<{ className?: string }> }
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
    icon: CheckCircle2,
  },
  approved: {
    label: "Approved",
    tone: "ok",
    help: "Verified by our team. Points credited.",
    icon: CheckCircle2,
  },
  needs_review: {
    label: "In review",
    tone: "warn",
    help: "A human is taking a look. This usually takes under a day.",
    icon: Clock,
  },
  rejected: {
    label: "Rejected",
    tone: "bad",
    help: "This screenshot didn't pass verification.",
    icon: XCircle,
  },
  revoked: {
    label: "Revoked",
    tone: "bad",
    help: "Previously approved, then reversed. Points removed.",
    icon: XCircle,
  },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = SUBMISSION_STATUS[status] ?? {
    label: status,
    tone: "neutral" as Tone,
  };
  const Icon = meta.icon;

  const STATUS_TEXT: Record<Tone, string> = {
    neutral: "text-ink",
    brand: "text-brand-press",
    ok: "text-brand-press",
    warn: "text-red-800",
    bad: "text-red-800",
    reel: "text-gray-800",
    poll: "text-gray-800",
    invite: "text-brand-press",
    rank: "text-gray-800",
  };
  const STATUS_BG: Record<Tone, string> = {
    neutral: "bg-gray-100 border border-gray-200",
    brand: "bg-brand-tint border border-brand/35",
    ok: "bg-brand-tint border border-brand/35",
    warn: "bg-red-100 border border-red-200",
    bad: "bg-red-100 border border-red-200",
    reel: "bg-gray-100 border border-gray-200",
    poll: "bg-gray-100 border border-gray-200",
    invite: "bg-brand-tint border border-brand/35",
    rank: "bg-gray-100 border border-gray-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-bold whitespace-nowrap",
        STATUS_BG[meta.tone],
        STATUS_TEXT[meta.tone]
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {meta.label}
    </span>
  );
}
