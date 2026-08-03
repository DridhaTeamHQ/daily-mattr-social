import * as React from "react";
import { cn } from "@/lib/utils";

const FIELD_BASE =
  "w-full bg-surface border border-line rounded-sm text-sm text-ink " +
  "transition-[border-color,box-shadow] duration-150 ease-out " +
  "hover:border-line-strong " +
  "focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 " +
  "disabled:bg-canvas-sunk disabled:text-ink-faint disabled:cursor-not-allowed " +
  "aria-[invalid=true]:border-bad aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad/15";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(FIELD_BASE, "h-10 px-3", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(FIELD_BASE, "px-3 py-2.5 min-h-24 resize-y", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn("block text-[13px] font-medium text-ink mb-1.5", className)}
      {...props}
    >
      {children}
      {required && (
        <span className="text-bad ml-0.5" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-[12.5px] text-bad mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-soft mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}
