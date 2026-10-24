"use client";

import * as React from "react";
import { UserCheck, UserMinus } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { DeleteAmbassadorsDialog } from "@/components/delete-ambassador-dialog";
import { ReasonDialog } from "@/components/reason-dialog";
import { SendMailButton } from "@/components/send-mail-button";
import { Button } from "@/components/ui/button";
import { setAmbassadorsStatus } from "@/lib/admin/actions";

/**
 * Ticking people on the ambassadors table and suspending them together.
 *
 * Same shape as the review queue's selection: the provider wraps the
 * server-rendered table rather than replacing it, and only the tick boxes and
 * the bar are client components reading this context.
 */

type Row = { id: string; status: string };

type Selection = {
  picked: ReadonlySet<string>;
  toggle: (id: string, on: boolean) => void;
  ids: string[];
  rowIds: string[];
  selectAll: () => void;
  clear: () => void;
};

const SelectionContext = React.createContext<Selection | null>(null);

export function AmbassadorSelection({
  /**
   * Everybody the current search and filters match, in table order — not just
   * the rows scrolled into view. "Select all" under "Batch F" means all of
   * Batch F; anybody filtered out drops out of the count and the action.
   */
  rows,
  children,
}: {
  rows: Row[];
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

  const rowIds = React.useMemo(() => rows.map((r) => r.id), [rows]);
  const clear = React.useCallback(() => setPicked(new Set()), []);
  const selectAll = React.useCallback(
    () => setPicked(new Set(rowIds)),
    [rowIds],
  );

  // Intersected with what the filters show, in the order the table shows them.
  const ids = React.useMemo(
    () => rowIds.filter((id) => picked.has(id)),
    [rowIds, picked],
  );

  const value = React.useMemo<Selection>(
    () => ({ picked, toggle, ids, rowIds, selectAll, clear }),
    [picked, toggle, ids, rowIds, selectAll, clear],
  );

  // Split by what each button can act on, so "Suspend 5" never counts the
  // two in the selection who are already suspended.
  const suspended = new Set(
    rows.filter((r) => r.status === "suspended").map((r) => r.id),
  );
  const toSuspend = ids.filter((id) => !suspended.has(id));
  const toReinstate = ids.filter((id) => suspended.has(id));
  // Only invited people can be sent a welcome email — see welcome-actions.
  const invited = new Set(
    rows.filter((r) => r.status === "invited").map((r) => r.id),
  );
  const toMail = ids.filter((id) => invited.has(id));

  return (
    <SelectionContext.Provider value={value}>
      {ids.length > 0 && (
        <SelectionBar
          count={ids.length}
          ids={ids}
          toSuspend={toSuspend}
          toReinstate={toReinstate}
          toMail={toMail}
          onClear={clear}
        />
      )}
      {children}
    </SelectionContext.Provider>
  );
}

const BOX =
  "size-4.5 shrink-0 cursor-pointer accent-[var(--color-brand-strong)]";

/** One person's tick box. Nothing outside the provider. */
export function SelectAmbassador({ id, name }: { id: string; name: string }) {
  const selection = React.useContext(SelectionContext);
  if (!selection) return null;

  return (
    <input
      type="checkbox"
      checked={selection.picked.has(id)}
      onChange={(event) => selection.toggle(id, event.target.checked)}
      aria-label={`Select ${name}`}
      className={BOX}
    />
  );
}

/** The header box: everybody the filters match, or nobody. */
export function SelectAllAmbassadors() {
  const selection = React.useContext(SelectionContext);
  const ref = React.useRef<HTMLInputElement>(null);

  const count = selection?.ids.length ?? 0;
  const total = selection?.rowIds.length ?? 0;
  const all = total > 0 && count === total;

  // Half a selection has no checked state of its own in HTML.
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && !all;
  }, [count, all]);

  if (!selection || total === 0) return null;

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={all}
      onChange={(event) =>
        event.target.checked ? selection.selectAll() : selection.clear()
      }
      aria-label={all ? "Clear selection" : `Select all ${total}`}
      title={all ? "Clear selection" : `Select all ${total}`}
      className={BOX}
    />
  );
}

function SelectionBar({
  count,
  ids,
  toSuspend,
  toReinstate,
  toMail,
  onClear,
}: {
  count: number;
  ids: string[];
  toSuspend: string[];
  toReinstate: string[];
  toMail: string[];
  onClear: () => void;
}) {
  const suspendCount = toSuspend.length;
  const reinstateCount = toReinstate.length;

  return (
    <div className="brut-sm sticky top-14 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm bg-surface px-3.5 py-2.5">
      <p className="text-[13px] font-extrabold text-ink">
        {count} selected
      </p>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {toMail.length > 0 && (
          <SendMailButton ids={toMail} variant="primary" onDone={onClear} />
        )}

        {/* Hidden rather than disabled when it would act on nobody: a
            greyed-out "Suspend 0" describes an action nobody asked for. */}
        {suspendCount > 0 && (
          <ReasonDialog
            action={setAmbassadorsStatus.bind(null, toSuspend, "suspended")}
            onSuccess={onClear}
            title={`Suspend ${suspendCount} ${suspendCount === 1 ? "ambassador" : "ambassadors"}`}
            description={`Their history is kept for 30 days and their referral codes are offered to the next people you add. Reinstated within 30 days, they carry on on new codes — otherwise everything is permanently deleted. All ${suspendCount} are sent this same reason.`}
            label="Reason"
            placeholder="Screenshots did not match the campaign"
            confirmLabel={`Suspend ${suspendCount}`}
            trigger={
              <Button size="sm" variant="danger">
                <UserMinus aria-hidden />
                Suspend {suspendCount}
              </Button>
            }
          />
        )}

        {reinstateCount > 0 && (
          <ActionButton
            size="sm"
            variant="secondary"
            className="text-emerald-700"
            action={setAmbassadorsStatus.bind(null, toReinstate, "active")}
            onSuccess={onClear}
            confirmMessage={`Reinstate ${reinstateCount} suspended ${reinstateCount === 1 ? "ambassador" : "ambassadors"}? They start earning again straight away.`}
          >
            <UserCheck aria-hidden />
            Reinstate {reinstateCount}
          </ActionButton>
        )}

        {/* Everybody ticked, whatever their status: deleting is final for
            invited, active and suspended alike. */}
        <DeleteAmbassadorsDialog ids={ids} onDone={onClear} />

        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
