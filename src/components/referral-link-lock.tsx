"use client";

import * as React from "react";
import { Link2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setReferralLinkUnlock } from "@/lib/admin/actions";
import { Card } from "@/components/ui/card";

/**
 * The switch for the ambassador share link and share card.
 *
 * The feature is built; what it waits for is the app being live in the stores.
 * That date moves, and it should not take a deploy to honour — so the state
 * lives in `app_settings` and this is the control.
 *
 * Three things you can do, because "unlock it" turned out to mean two
 * different things: open it right now, or set the moment it opens by itself.
 * A launch at 9am on a Monday should not require somebody to be at a laptop at
 * 9am on a Monday.
 *
 * The date box is `datetime-local`, so the admin types the time they mean in
 * their own clock and the browser hands us a real instant. It is submitted
 * explicitly rather than on change — a half-typed year is a date in 2002, and
 * an unlock that fires the moment you tab through the field is not a schedule.
 */
export function ReferralLinkLock({
  unlockAt,
  open,
}: {
  /** ISO instant the link opens, or null when nothing is scheduled. */
  unlockAt: string | null;
  /** Whether it is open right now, decided on the server. */
  open: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState(() => toLocalInput(unlockAt));

  function run(at: Date | null) {
    startTransition(async () => {
      const result = await setReferralLinkUnlock(at);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  function schedule() {
    if (!draft) {
      toast.error("Pick a date and time first.");
      return;
    }

    const at = new Date(draft);
    if (Number.isNaN(at.getTime())) {
      toast.error("That isn't a valid date.");
      return;
    }

    run(at);
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={
              open
                ? "grid size-10 shrink-0 place-items-center rounded-xl bg-ok-tint text-ok"
                : "grid size-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-400"
            }
          >
            {open ? (
              <LockOpen className="size-5" aria-hidden />
            ) : (
              <Lock className="size-5" aria-hidden />
            )}
          </div>

          <div>
            <h2 className="display text-[16px] text-ink">
              Share links
            </h2>
            <p className="mt-1 max-w-prose text-[12.5px] text-ink-soft">
              {open
                ? "Open. Every ambassador can see their link and the shareable card."
                : "Locked. Ambassadors see their referral code and a note saying links are not open yet."}
              {!open && unlockAt && (
                <>
                  {" "}
                  Scheduled to open on{" "}
                  <strong className="font-extrabold text-ink">
                    {formatWhen(unlockAt)}
                  </strong>
                  .
                </>
              )}
            </p>
            <p className="mt-1.5 text-[12px] text-ink-faint">
              The code itself always works — this only controls the link and the
              share card.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {open ? (
            <Button variant="secondary" onClick={() => run(null)} loading={pending}>
              <Lock aria-hidden />
              Lock again
            </Button>
          ) : (
            <Button onClick={() => run(new Date())} loading={pending}>
              <LockOpen aria-hidden />
              Unlock now
            </Button>
          )}
        </div>
      </div>

      {/* Scheduling stays available while it is open, so a launch can be moved
          or pulled back without locking it first. */}
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-gray-200 pt-4">
        <label className="text-[12px] font-extrabold text-ink-soft">
          <span className="mb-1 block uppercase tracking-wide">
            Or open it automatically at
          </span>
          <input
            type="datetime-local"
            value={draft}
            disabled={pending}
            onChange={(event) => setDraft(event.target.value)}
            className="h-10 rounded-lg border border-gray-300 bg-surface px-3 text-[13px] font-bold text-ink focus:border-ink focus:outline-none"
          />
        </label>

        <Button
          variant="secondary"
          onClick={schedule}
          disabled={pending || !draft}
        >
          <Link2 aria-hidden />
          Schedule
        </Button>
      </div>
    </Card>
  );
}

/**
 * An ISO instant as `datetime-local` wants it: the wall clock, no zone.
 *
 * Built from the local parts rather than by slicing `toISOString()`, which
 * would show the UTC time in the box — 5½ hours off for everyone using this.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";

  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
