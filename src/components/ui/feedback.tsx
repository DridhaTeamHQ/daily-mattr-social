import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-gray-100 rounded-md animate-sheen",
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
        <div className="mb-5 grid size-16 place-items-center rounded-xl bg-gray-50 border border-gray-200 text-ink">
          <Icon className="size-7" />
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

export function Note({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: "neutral" | "brand" | "warn" | "bad" | "ok" | "invite";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const NOTE_BG = {
    neutral: "bg-gray-50",
    brand: "bg-brand-tint border border-brand/20",
    warn: "bg-red-50 border border-red-100",
    bad: "bg-red-50 border border-red-100",
    ok: "bg-brand-tint border border-brand/20",
    invite: "bg-brand-tint border border-brand/20",
  };

  const ICON_BG = {
    neutral: "bg-gray-600 text-white",
    brand: "bg-brand-strong text-white",
    warn: "bg-red-500 text-white",
    bad: "bg-red-500 text-white",
    ok: "bg-brand-strong text-white",
    invite: "bg-brand-strong text-white",
  };

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-xl px-5 py-4",
        NOTE_BG[tone],
        className,
      )}
    >
      <div className={cn("shrink-0 grid place-items-center rounded-full size-6 mt-0.5", ICON_BG[tone])}>
         <Info className="size-4" />
      </div>
      <div>
        {title && (
          <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-ink">
            {title}
          </p>
        )}
        <div className="text-[13px] leading-relaxed font-medium text-ink-soft">
           {children}
        </div>
      </div>
    </div>
  );
}
