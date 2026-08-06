import { cn } from "@/lib/utils";

/**
 * The progress bar with somebody on it.
 *
 * A filled rectangle tells you a number you have already read on the line
 * above. Putting a runner on the track says the same thing in a way you feel:
 * there is a distance, you are somewhere along it, and the flag at the end is
 * a place you arrive at rather than a percentage you reach.
 *
 * The runner is an eight-frame pixel sprite, cut out of the Lottie the team
 * picked. The whole cycle is 2.5KB — the source SVG was 540KB of individual
 * 4px squares and would have needed a Lottie runtime to move — and because it
 * is pixel art the bar is drawn to match: square corners, a hard border, and a
 * flow that advances in whole pixels rather than sliding smoothly.
 *
 * The illustrated character this replaced is still at `/runner-sprite.webp`;
 * swapping back is the sprite URL, the frame width and the step count.
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
  // them would hang off the track. Keeping the marker between 4% and 93%
  // costs a couple of pixels of accuracy and buys a figure that is always
  // whole and never standing inside the flag.
  const marker = Math.max(4, Math.min(93, clamped));

  return (
    <div className={cn("relative pt-16 text-ink", className)}>
      {/* ─── Track ─────────────────────────────────────────────────────────
          Last in the flow, so the wrapper's bottom edge IS the track's bottom
          edge. Everything standing on the bar is then positioned from
          `bottom`, one track-height up — which is the only way the figure
          stays glued to it as the bar changes height at the sm breakpoint. */}
      <div className="pixel-track relative h-4 w-full overflow-hidden sm:h-5">
        {/* Two elements, not one. `animation` is a shorthand, so the ride-in
            and the flow cannot both live on the same node — the second
            declaration would simply replace the first and one of them would
            silently never run. The outer one owns the width, the inner one
            owns the moving blocks. */}
        <div
          className="fill-to h-full"
          style={{ "--fill-to": `${clamped}%` } as React.CSSProperties}
        >
          <span className="pixel-fill block h-full w-full" />
        </div>
      </div>

      {/* ─── Runner ────────────────────────────────────────────────────────── */}
      <div
        className="run-to absolute bottom-4 w-0 sm:bottom-5"
        style={{ "--run-to": `${marker}%` } as React.CSSProperties}
        aria-hidden
      >
        <span className="runner-sprite block -translate-x-1/2" />
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

/**
 * The thing being run at.
 *
 * Drawn on the same 3px grid as everything else here and with
 * `shapeRendering="crispEdges"`, so it does not sit next to pixel art with
 * anti-aliased edges of its own.
 */
function Flag() {
  return (
    <svg width="21" height="30" viewBox="0 0 21 30" shapeRendering="crispEdges">
      <rect x="0" y="27" width="9" height="3" fill="currentColor" />
      <rect x="3" y="0" width="3" height="27" fill="currentColor" />
      <g className="flag-wave">
        <rect x="6" y="3" width="12" height="3" fill="currentColor" />
        <rect x="6" y="6" width="15" height="3" fill="currentColor" />
        <rect x="6" y="9" width="12" height="3" fill="currentColor" />
      </g>
    </svg>
  );
}
