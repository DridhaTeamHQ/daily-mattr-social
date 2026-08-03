"use client";

import * as React from "react";
import { PartyPopper, Star, X } from "lucide-react";

import { useCelebration } from "@/components/celebrate";
import { TIERS, tierFor } from "@/components/points-hero";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "dm:last-tier";

/** `null` means "no baseline yet" — first visit, or storage unavailable. */
function readStoredTier(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
  } catch {
    // Private mode or storage disabled.
    return null;
  }
}

/** The baseline only ever changes because we changed it, so nothing to watch. */
function subscribeNever() {
  return () => {};
}

/**
 * Fires a level-up card the first time a student loads the app after crossing
 * a tier.
 *
 * The "last seen tier" lives in localStorage rather than the database on
 * purpose: it is a per-device presentation detail, not a fact about the
 * ambassador, and putting it in Postgres would mean a write on every dashboard
 * render to answer a question nobody will ever query.
 *
 * Consequence, accepted knowingly: sign in on a second device and you may see
 * the card again. Being congratulated twice is a much better failure than
 * being congratulated never.
 */
export function LevelUpWatcher({ points }: { points: number }) {
  const fireConfetti = useCelebration();
  const [dismissed, setDismissed] = React.useState(false);

  /**
   * The baseline is read once and then frozen in a ref, so writing the new
   * value below doesn't change the snapshot and yank the card away
   * mid-celebration. `useSyncExternalStore` is what lets this be read without
   * a setState-in-effect: the server snapshot is null, so SSR and hydration
   * agree, and the real value arrives on the client's own terms.
   */
  const baseline = React.useRef<number | null | undefined>(undefined);
  const getSnapshot = React.useCallback(() => {
    if (baseline.current === undefined) baseline.current = readStoredTier();
    return baseline.current;
  }, []);

  const stored = React.useSyncExternalStore(
    subscribeNever,
    getSnapshot,
    () => null,
  );

  const { current } = tierFor(points);
  const index = TIERS.findIndex((t) => t.name === current.name);

  // No baseline means first visit — record where they are rather than
  // congratulating them for simply existing.
  const leveledUp = stored !== null && index > stored;
  const show = leveledUp && !dismissed;

  React.useEffect(() => {
    if (stored === index) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(index));
    } catch {
      // Nothing to do — worst case they see the card again next visit.
    }
  }, [stored, index]);

  React.useEffect(() => {
    if (show) fireConfetti();
  }, [show, fireConfetti]);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`New level reached: ${current.name}`}
      className="fixed inset-0 z-[70] grid place-items-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => setDismissed(true)}
        className="animate-fade absolute inset-0 bg-ink/40"
      />

      <div className="animate-slam brut-lg relative w-full max-w-sm rounded-lg bg-brand p-6 text-center">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Close"
          className="brut-sm absolute -top-3 -right-3 grid size-9 place-items-center rounded-full bg-surface text-ink"
        >
          <X className="size-4" />
        </button>

        <div className="brut animate-wiggle mx-auto grid size-16 place-items-center rounded-full bg-reel">
          <PartyPopper className="size-8 text-ink" />
        </div>

        <p className="mt-4 text-[13px] font-extrabold tracking-widest text-ink uppercase">
          Level up
        </p>
        <p className="display mt-1 text-[34px] leading-none text-ink">
          {current.name}
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed font-semibold text-ink/80">
          You just crossed into a new tier. Keep the streak going and the next
          one is closer than you think.
        </p>

        <div className="mt-5 flex justify-center">
          <Button variant="secondary" onClick={() => setDismissed(true)}>
            <Star className="size-4" fill="currentColor" />
            Nice
          </Button>
        </div>
      </div>
    </div>
  );
}
