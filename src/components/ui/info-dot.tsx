"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";

/** How long the note waits after the pointer leaves, so the gap can be crossed. */
const LINGER_MS = 140;

/**
 * A small "i" that explains the figure it sits next to.
 *
 * A popover rather than a tooltip: what needs explaining on a tile is what
 * people are unsure about on a phone, where hovering does not exist — so it
 * opens on tap, and on a mouse it also opens on hover, because an "i" invites
 * one. Closing waits a moment for the pointer to cross the gap into the note.
 *
 * Focus is deliberately left where it was on open: a note that appears under
 * the cursor and then steals the caret is a note that interrupts.
 */
export function InfoDot({
  label = "More about this",
  children,
}: {
  /** What a screen reader announces — say what it explains, not "info". */
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);

  const hold = React.useCallback(() => window.clearTimeout(timer.current), []);
  const release = React.useCallback(() => {
    hold();
    timer.current = window.setTimeout(() => setOpen(false), LINGER_MS);
  }, [hold]);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          onMouseEnter={() => {
            hold();
            setOpen(true);
          }}
          onMouseLeave={release}
          className="rounded-full border border-gray-200 bg-white p-1.5 text-ink-soft shadow-sm transition-colors hover:border-brand/40 hover:text-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Info className="size-4" aria-hidden />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onMouseEnter={hold}
          onMouseLeave={release}
          className="animate-rise z-50 max-w-[17rem] rounded-xl bg-ink px-3.5 py-3 text-[13px] leading-relaxed font-semibold text-white shadow-xl"
        >
          {children}
          <Popover.Arrow className="fill-ink" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
