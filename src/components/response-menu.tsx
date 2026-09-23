"use client";

import Link from "next/link";
import * as React from "react";
import { CheckCircle2, MoreVertical, Table2 } from "lucide-react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/admin/guards";
import { cn } from "@/lib/utils";

/**
 * The ⋮ on one response card.
 *
 * A menu rather than a button on every card: a list of fifteen duplicates
 * with fifteen blue "Not a duplicate" buttons is a wall of the one control
 * that pays out points. Behind the dots it is one deliberate click away, and
 * still confirmed before anything changes.
 */
export function ResponseMenu({
  restore,
  restoreLabel,
  confirmMessage,
  tableHref,
}: {
  /** Bound on the server; absent when the response already counts. */
  restore?: () => Promise<ActionResult>;
  restoreLabel?: string;
  confirmMessage?: string;
  /** The same response in the full table, with its answers. */
  tableHref: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const root = React.useRef<HTMLDivElement>(null);

  // Closes on a click anywhere else and on Escape, like any menu.
  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run() {
    if (!restore) return;
    setOpen(false);
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    startTransition(async () => {
      try {
        const result = await restore();
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      } catch {
        toast.error("That didn't go through. Try again.");
      }
    });
  }

  const item =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-bold text-ink hover:bg-gray-50 disabled:opacity-50";

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        disabled={pending}
        className={cn(
          "grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-gray-100 hover:text-ink",
          open && "bg-gray-100 text-ink",
          pending && "animate-pulse",
        )}
      >
        <MoreVertical aria-hidden className="size-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-surface p-1 shadow-lg"
        >
          {restore && (
            <button type="button" role="menuitem" onClick={run} className={item}>
              <CheckCircle2 aria-hidden className="size-4 text-emerald-600" />
              {restoreLabel ?? "Count it"}
            </button>
          )}
          <Link
            href={tableHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={item}
          >
            <Table2 aria-hidden className="size-4 text-ink-soft" />
            View in table
          </Link>
        </div>
      )}
    </div>
  );
}
