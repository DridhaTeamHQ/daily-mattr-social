"use client";

import * as React from "react";
import { CheckCheck } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { ReasonDialog } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { approveSubmissions, rejectSubmissions } from "@/lib/admin/actions";

/**
 * Ticking your way through the queue.
 *
 * "Approve all" is all-or-nothing, and one screenshot that needs a closer look
 * is enough to make an admin fall back to clicking Approve twenty times. This
 * is the middle: read them, tick the ones that pass, decide those together and
 * leave the rest in the queue.
 *
 * The provider wraps the server-rendered list rather than replacing it — the
 * cards stay on the server, with signed URLs and all, and only the checkbox
 * and the bar are client components reading this context.
 */

type Selection = {
  picked: ReadonlySet<string>;
  toggle: (id: string, on: boolean) => void;
};

const SelectionContext = React.createContext<Selection | null>(null);

export function ReviewSelection({
  /**
   * The submissions a tick is allowed to act on: everything currently on
   * screen that is still waiting on a decision. Everything else is derived
   * from this, so a decided submission drops out of the selection the moment
   * the list refreshes rather than lingering in a count.
   */
  openIds,
  children,
}: {
  openIds: string[];
  children: React.ReactNode;
}) {
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggle = React.useCallback((id: string, on: boolean) => {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clear = React.useCallback(() => setPicked(new Set()), []);

  // Intersected with what's on screen, in the order the queue shows them.
  const ids = React.useMemo(
    () => openIds.filter((id) => picked.has(id)),
    [openIds, picked],
  );

  const value = React.useMemo<Selection>(
    () => ({ picked, toggle }),
    [picked, toggle],
  );

  return (
    <SelectionContext.Provider value={value}>
      {openIds.length > 0 && (
        <SelectionBar
          ids={ids}
          openIds={openIds}
          onSelectAll={() => setPicked(new Set(openIds))}
          onClear={clear}
        />
      )}
      {children}
    </SelectionContext.Provider>
  );
}

/**
 * One submission's tick box.
 *
 * Renders nothing outside the provider, so a card that is already decided —
 * or a queue rendered without selection at all — simply has no checkbox
 * rather than an inert one.
 */
export function SelectSubmission({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const selection = React.useContext(SelectionContext);
  if (!selection) return null;

  return (
    <input
      type="checkbox"
      checked={selection.picked.has(id)}
      onChange={(event) => selection.toggle(id, event.target.checked)}
      aria-label={`Select ${name}'s submission`}
      className="size-4.5 shrink-0 cursor-pointer accent-[var(--color-brand-strong)]"
    />
  );
}

function SelectionBar({
  ids,
  openIds,
  onSelectAll,
  onClear,
}: {
  ids: string[];
  openIds: string[];
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const count = ids.length;
  const all = count === openIds.length;
  const someRef = React.useRef<HTMLInputElement>(null);

  // Half a selection has no checked state of its own in HTML, and a box that
  // reads "unticked" above "3 selected" is a lie about what the buttons will do.
  React.useEffect(() => {
    if (someRef.current) someRef.current.indeterminate = count > 0 && !all;
  }, [count, all]);

  return (
    <div className="brut-sm sticky top-14 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm bg-surface px-3.5 py-2.5">
      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-extrabold text-ink">
        <input
          ref={someRef}
          type="checkbox"
          checked={all}
          onChange={(event) => (event.target.checked ? onSelectAll() : onClear())}
          className="size-4.5 shrink-0 cursor-pointer accent-[var(--color-brand-strong)]"
        />
        {count > 0 ? `${count} of ${openIds.length} selected` : "Select all"}
      </label>

      {/* Hidden rather than disabled while nothing is ticked: a greyed-out
          "Approve 0" is a button that describes an action nobody asked for. */}
      {count > 0 && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ActionButton
            size="sm"
            action={approveSubmissions.bind(null, ids)}
            onSuccess={onClear}
            confirmMessage={`Approve the ${count} selected? Points are credited to each ambassador and this cannot be undone in bulk.`}
          >
            <CheckCheck aria-hidden />
            Approve {count}
          </ActionButton>

          <ReasonDialog
            action={rejectSubmissions.bind(null, ids)}
            onSuccess={onClear}
            title={`Reject ${count} ${count === 1 ? "submission" : "submissions"}`}
            description={`All ${count} ambassadors see this same reason, so write one that is true of every screenshot you have ticked.`}
            label="Reason"
            optional
            hint="Optional. Left empty, each of them is told their upload wasn't approved, without a specific reason."
            placeholder="The handle in the screenshot doesn't match @dailymattr."
            confirmLabel={`Reject ${count}`}
            trigger={
              <Button size="sm" variant="secondary">
                Reject {count}
              </Button>
            }
          />

          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
