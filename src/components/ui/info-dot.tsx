"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";

/**
 * A small "i" that explains the figure it sits next to.
 *
 * A popover rather than a tooltip, deliberately: the things worth explaining
 * on a tile are the ones people are unsure about on a phone, where a hover
 * does not exist. It opens on tap, closes on the next tap or Escape, and is
 * reachable by keyboard because it is a real button.
 */
export function InfoDot({
  label = "More about this",
  children,
}: {
  /** What a screen reader announces — say what it explains, not "info". */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
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
          className="animate-rise z-50 max-w-[17rem] rounded-xl border border-brand/20 bg-brand-tint px-3.5 py-3 text-[12px] leading-relaxed font-semibold text-brand-press shadow-lg"
        >
          {children}
          <Popover.Arrow className="fill-brand-tint" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
