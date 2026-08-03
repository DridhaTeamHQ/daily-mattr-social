import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-canvas-sunk rounded-sm animate-sheen", className)}
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
        "flex flex-col items-center justify-center text-center px-6 py-14",
        className,
      )}
    >
      {Icon && (
        <div className="size-11 rounded-md bg-canvas-sunk grid place-items-center mb-4">
          <Icon className="size-5 text-ink-faint" />
        </div>
      )}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && (
        <p className="text-[13.5px] text-ink-soft mt-1.5 max-w-sm leading-relaxed">
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
    neutral: "bg-canvas-sunk border-line text-ink-soft",
    brand: "bg-brand-tint border-brand-line text-brand-press",
    warn: "bg-warn-tint border-warn-line text-warn",
    bad: "bg-bad-tint border-bad-line text-bad",
    ok: "bg-ok-tint border-ok-line text-ok",
  };
  return (
    <div
      className={cn(
        "border rounded-sm px-3.5 py-3 text-[13px] leading-relaxed",
        tones[tone],
        className,
      )}
    >
      {title && <p className="font-semibold mb-1">{title}</p>}
      {children}
    </div>
  );
}
