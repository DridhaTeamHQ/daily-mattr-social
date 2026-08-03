import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Inputs get the same outline as everything else. Focus deepens the shadow
 * instead of adding a coloured ring — a blurred glow is the one thing that
 * would look out of place here.
 */
const FIELD_BASE =
  "w-full bg-surface border-[3px] border-ink rounded-sm text-[15px] font-medium text-ink " +
  "shadow-[3px_3px_0_var(--color-ink)] " +
  "transition-[box-shadow,transform,background-color] duration-100 ease-out " +
  "focus:outline-none focus:shadow-[5px_5px_0_var(--color-ink)] focus:-translate-x-px focus:-translate-y-px " +
  "disabled:bg-canvas-sunk disabled:text-ink-faint disabled:cursor-not-allowed disabled:shadow-none " +
  "aria-[invalid=true]:bg-bad-tint";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(FIELD_BASE, "h-11 px-3.5", className)}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(FIELD_BASE, "px-3.5 py-2.5 min-h-24 resize-y", className)}
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
      className={cn(
        "block text-[13px] font-extrabold tracking-wide text-ink uppercase mb-1.5",
        className,
      )}
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
        <p className="text-[12.5px] font-bold text-bad mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-soft mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}
