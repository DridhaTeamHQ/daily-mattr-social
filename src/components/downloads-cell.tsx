"use client";

import * as React from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setReferralCount } from "@/lib/admin/actions";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Editable download count.
 *
 * Reads as plain text until you click it, so the table stays scannable — a row
 * of input boxes turns a report into a form. Committing writes through
 * `setReferralCount`, which creates or voids conversion rows so the ledger and
 * the ambassador's own screen stay in step.
 */
export function DownloadsCell({
  profileId,
  name,
  value,
  voided,
}: {
  profileId: string;
  name: string;
  value: number;
  voided: number;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value));
  const [pending, startTransition] = React.useTransition();

  function open() {
    setDraft(String(value));
    setEditing(true);
  }

  function commit() {
    const next = Number(draft);

    if (!Number.isInteger(next) || next < 0) {
      toast.error("Enter a whole number.");
      return;
    }
    if (next === value) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const result = await setReferralCount(profileId, next);
      if (result.ok) {
        toast.success(result.message);
        setEditing(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <input
          type="number"
          min={0}
          step={1}
          value={draft}
          autoFocus
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label={`Downloads for ${name}`}
          className="h-9 w-20 rounded-xs border-[3px] border-ink bg-surface px-2 text-right text-[14px] font-extrabold text-ink shadow-[2px_2px_0_var(--color-ink)] focus:outline-none"
        />
        <Button
          size="icon"
          variant="primary"
          onClick={commit}
          loading={pending}
          title="Save"
        >
          <Check aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          onClick={() => setEditing(false)}
          disabled={pending}
          title="Cancel"
        >
          <X aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={open}
        title="Click to set the number of downloads"
        className="group inline-flex items-center gap-1.5 rounded-xs border-2 border-transparent px-1.5 py-0.5 transition-colors hover:border-ink hover:bg-canvas-sunk"
      >
        <span
          className={cn(
            "tabular display text-[18px]",
            value > 0 ? "text-ink" : "text-ink-faint",
          )}
        >
          {formatNumber(value)}
        </span>
        <Pencil className="size-3.5 text-ink-faint group-hover:text-ink" />
      </button>

      {voided > 0 && (
        <span className="text-[11.5px] font-bold text-bad">{voided} voided</span>
      )}
    </div>
  );
}
