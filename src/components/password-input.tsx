"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field you can read back.
 *
 * Students type these on phones, often a temporary password an admin read out
 * over a call. Without a reveal, a single mistyped character means retyping the
 * whole thing with no idea which one was wrong — and password managers are not
 * the norm here.
 *
 * The toggle is a real button, not an icon with a click handler, so it is
 * reachable by keyboard and announces its state. `tabIndex={-1}` keeps it out
 * of the Tab path between the field and the submit button, where it would
 * interrupt the natural run through the form.
 */
export function PasswordInput({
  id,
  name,
  autoComplete,
  required,
  invalid,
  placeholder,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
  invalid?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = React.useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={invalid ? true : undefined}
        className="pr-11"
        {...(onChange
          ? { value, onChange: (e) => onChange(e.target.value) }
          : {})}
      />

      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className={cn(
          "absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center",
          "rounded-md text-ink-faint transition-colors hover:bg-gray-100 hover:text-ink",
        )}
      >
        {shown ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

/** The rules a new password has to clear, and whether it does. */
export function passwordChecks(value: string) {
  return [
    { label: "At least 8 characters", ok: value.length >= 8 },
    { label: "A letter", ok: /[a-z]/i.test(value) },
    { label: "A number", ok: /\d/.test(value) },
  ];
}

/**
 * Live rules under a new-password field.
 *
 * Shown from the first keystroke rather than on submit, because a rule you
 * only learn about by failing is a rule you have to guess at first.
 */
export function PasswordRules({ value }: { value: string }) {
  const checks = passwordChecks(value);

  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {checks.map((check) => (
        <li
          key={check.label}
          className={cn(
            "text-[12px] font-semibold transition-colors",
            value.length === 0
              ? "text-ink-faint"
              : check.ok
                ? "text-ok"
                : "text-ink-soft",
          )}
        >
          {value.length > 0 && check.ok ? "✓ " : "• "}
          {check.label}
        </li>
      ))}
    </ul>
  );
}
