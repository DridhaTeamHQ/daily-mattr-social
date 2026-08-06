import { cn } from "@/lib/utils";

/**
 * The progress bar with somebody on it.
 *
 * A filled rectangle tells you a number you have already read on the line
 * above. Putting a runner on the track says the same thing in a way you feel:
 * there is a distance, you are somewhere along it, and the flag at the end is
 * a place you arrive at rather than a percentage you reach.
 *
 * The runner is a four-frame sprite sheet — an illustrated character, not a
 * stick figure. Two attempts at drawing one in SVG both read as a squiggle at
 * this size: a 60px figure has no room for a face, and without a face it is a
 * shape doing something rather than a person. `public/runner-sprite.webp` is
 * 22KB for the whole cycle, which is cheaper than the CSS the stick figure
 * needed.
 *
 * The frames are one image and one `steps(4)` animation, so the browser does
 * no compositing work per frame and there is nothing to preload mid-cycle.
 */
export function MilestoneProgress({
  pct,
  className,
}: {
  /** 0–100. How far along the track they are. */
  pct: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));

  // The runner is centred on their own position, so at the extremes half of
  // them would hang off the track. Keeping the marker between 5% and 92%
  // costs a couple of pixels of accuracy and buys a figure that is always
  // whole and never standing inside the flag.
  const marker = Math.max(5, Math.min(92, clamped));

  return (
    <div className={cn("relative pt-16 text-ink", className)}>
      {/* ─── Track ─────────────────────────────────────────────────────────
          Last in the flow, so the wrapper's bottom edge IS the track's bottom
          edge. Everything standing on the bar is then positioned from
          `bottom`, one track-height up — which is the only way the figure
          stays glued to it as the bar changes height at the sm breakpoint. */}
      <div className="relative h-4 w-full overflow-hidden rounded-full border border-gray-200/60 bg-gray-100 p-0.5 sm:h-5">
        {/* Brightening toward the head, so the eye goes to where the runner
            is. Deliberately not striped — barber-pole stripes on a bar read
            as "loading", and this is the opposite of waiting. */}
        <div
          className="fill-to h-full rounded-full bg-gradient-to-r from-brand-strong to-brand"
          style={{ "--fill-to": `${clamped}%` } as React.CSSProperties}
        />
      </div>

      {/* ─── Runner ────────────────────────────────────────────────────────── */}
      <div
        className="run-to absolute bottom-4 mb-[-2px] w-0 sm:bottom-5"
        style={{ "--run-to": `${marker}%` } as React.CSSProperties}
        aria-hidden
      >
        <div className="relative -translate-x-1/2">
          {/* Grounds him. The sprite has no shadow of its own, and without one
              he reads as pasted on rather than standing on the bar. */}
          <span className="absolute inset-x-1 bottom-0 h-[3px] rounded-[50%] bg-ink/15 blur-[1px]" />
          <span className="runner-sprite block" />
        </div>
      </div>

      {/* ─── Finish line ───────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute right-0 bottom-4 sm:bottom-5"
        aria-hidden
      >
        <Flag />
      </div>
    </div>
  );
}

/** The thing being run at. Waves on its own, gently. */
function Flag() {
  return (
    <svg width="20" height="30" viewBox="0 0 20 30" fill="none">
      <path
        d="M3 29 L3 3"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        className="flag-wave"
        d="M3 4 L16 8.5 L3 13 Z"
        fill="currentColor"
        style={{ transformBox: "view-box", transformOrigin: "3px 8.5px" }}
      />
    </svg>
  );
}
