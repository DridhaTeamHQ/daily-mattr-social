"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A number field with plus and minus buttons.
 *
 * Native number spinners are about 10px tall, invisible until hover, and gone
 * entirely on touch — which is where most of this gets used. Explicit buttons
 * make the common edit (nudge it by five) a tap instead of a select-and-retype,
 * and the field stays typeable for the uncommon one.
 */
export function Stepper({
  name,
  value,
  onChange,
  min = 0,
  max = 1000,
  step = 5,
  label,
  className,
}: {
  name?: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  className?: string;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  const button =
    "grid size-8 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-ink-soft transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-40 disabled:hover:border-gray-200";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        className={button}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
      >
        <Minus className="size-4" />
      </button>

      <input
        // The real form value. The buttons drive React state; this posts it.
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? clamp(next) : min);
        }}
        aria-label={label}
        className="h-9 w-14 rounded-md border border-gray-200 bg-white text-center text-[14px] font-bold text-ink focus:border-brand focus:outline-none"
      />

      <button
        type="button"
        className={button}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
