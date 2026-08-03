import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-canvas-sunk border-2 border-ink rounded-sm animate-sheen",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="brut animate-float mb-5 grid size-16 place-items-center rounded-md bg-brand">
          <Icon className="size-7 text-ink" />
        </div>
      )}
      <p className="display text-[18px] text-ink">{title}</p>
      {description && (
        <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed font-medium text-ink-soft">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Inline explanatory note. `tone="bad"` for errors, `warn` for caveats. */
export function Note({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: "neutral" | "brand" | "warn" | "bad" | "ok";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-canvas-sunk",
    brand: "bg-brand",
    warn: "bg-warn-tint",
    bad: "bg-bad-tint",
    ok: "bg-ok-tint",
  };

  return (
    <div
      className={cn(
        // Text stays ink on every tone — the fill carries the meaning, and
        // black on a light fill never needs a contrast check.
        "brut rounded-sm px-4 py-3 text-[13px] leading-relaxed font-medium text-ink",
        tones[tone],
        className,
      )}
    >
      {title && (
        <p className="mb-1 text-[13px] font-extrabold tracking-wide uppercase">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}
