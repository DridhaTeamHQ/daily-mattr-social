import { cn, formatNumber } from "@/lib/utils";

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
/** Where the coins sit along the track, as a percentage of the way. */
const COIN_STOPS = [30, 50, 70, 86];

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
            and the shine cannot both live on the same node — the second
            declaration would simply replace the first and one of them would
            silently never run. The outer one owns the width, the inner one
            owns the ground it is made of. */}
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

      {/* ─── Coins still to collect ─────────────────────────────────────────
          One per quarter of the way, and only the ones ahead of the runner.
          They are the same information as the percentage, said as objects:
          three coins left is a distance you can picture, 42% is not. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-9 sm:bottom-10" aria-hidden>
        {COIN_STOPS.filter((stop) => stop > marker + 6).map((stop) => (
          <Coin
            key={stop}
            className="absolute -translate-x-1/2"
            style={{ left: `${stop}%` }}
          />
        ))}
      </div>

      {/* ─── Finish line ─────────────────────────────────────────────────────
          The block sits above the flag rather than beside it, so the last
          thing on the track is the thing being run at. */}
      <div
        className="pointer-events-none absolute right-0 bottom-4 flex flex-col items-center gap-1.5 sm:bottom-5"
        aria-hidden
      >
        <QuestionBlock />
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

/**
 * The milestone card, as a level.
 *
 * Every other card on this page is a number in a box. This one has somebody
 * running across it, so it gets the rest of the scene: sky, clouds, bushes, a
 * question block over the finish and coins along the stretch still to go.
 *
 * The theme stops at this card on purpose. A dashboard where everything is a
 * game is a dashboard where nothing stands out; one card that is a place is
 * the thing the eye goes to, which is exactly where the goal should be.
 *
 * Everything is drawn on a 3px grid with hard edges, so it sits next to a
 * pixel sprite without one of them looking anti-aliased. The HUD text takes
 * the drop shadow a real game HUD uses, because white on sky blue is 2.5:1
 * and unreadable without it.
 */
export function MilestoneLevel({
  name,
  at,
  remaining,
  pct,
}: {
  name: string;
  at: number;
  remaining: number;
  pct: number;
}) {
  return (
    <div className="mario-level relative overflow-hidden border-[3px] border-ink p-5 sm:p-6">
      {/* ─── Scenery ───────────────────────────────────────────────────────
          Behind everything, and inert: pointer-events and the reading order
          both skip it. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Cloud className="cloud-drift absolute top-3 left-[8%] opacity-95" />
        <Cloud className="cloud-drift cloud-slow absolute top-8 left-[52%] scale-75 opacity-80" />
        <Cloud className="cloud-drift cloud-slower absolute top-1 left-[78%] scale-90 opacity-90" />
        {/* Standing ON the bar, behind the runner — the card's bottom
            padding plus the track height is where the ground actually is. */}
        <Bush className="absolute bottom-[36px] left-[14%] scale-90 sm:bottom-[44px]" />
        <Bush className="absolute bottom-[36px] left-[62%] sm:bottom-[44px]" />
      </div>

      {/* ─── HUD ───────────────────────────────────────────────────────────── */}
      <div className="mario-hud relative flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <Coin className="shrink-0" />
          <span>
            Next milestone: <strong className="font-black">{name}</strong>{" "}
            <span className="opacity-80">({formatNumber(at)} pts)</span>
          </span>
        </span>
        <span className="font-black">
          {formatNumber(remaining)} pts needed ({pct}%)
        </span>
      </div>

      <MilestoneProgress pct={pct} className="relative" />
    </div>
  );
}

/** Two rows of overlapping blocks — the shape reads as a cloud at any size. */
function Cloud({ className }: { className?: string }) {
  return (
    <svg
      width="45"
      height="24"
      viewBox="0 0 45 24"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <g fill="#ffffff">
        <rect x="12" y="3" width="9" height="6" />
        <rect x="24" y="6" width="9" height="6" />
        <rect x="6" y="9" width="33" height="6" />
        <rect x="3" y="15" width="39" height="6" />
      </g>
    </svg>
  );
}

/** The same silhouette in green, sitting on the ground behind the bar. */
function Bush({ className }: { className?: string }) {
  return (
    <svg
      width="54"
      height="18"
      viewBox="0 0 54 18"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <g fill="#3f9b2f">
        <rect x="9" y="6" width="9" height="6" />
        <rect x="24" y="3" width="9" height="9" />
        <rect x="39" y="6" width="9" height="6" />
        <rect x="3" y="12" width="48" height="6" />
      </g>
    </svg>
  );
}

/** A coin. Spins on its own, in four steps like the ones it is copying. */
function Coin({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={cn("coin-spin inline-block", className)} style={style} aria-hidden>
      <svg width="15" height="18" viewBox="0 0 15 18" shapeRendering="crispEdges">
        <rect x="3" y="0" width="9" height="18" fill="#e39b1f" />
        <rect x="0" y="3" width="15" height="12" fill="#e39b1f" />
        <rect x="3" y="3" width="9" height="12" fill="#fbd000" />
        <rect x="6" y="6" width="3" height="6" fill="#e39b1f" />
      </svg>
    </span>
  );
}

/**
 * The reward at the end of the run.
 *
 * A question block, which is the one object in this idiom that means "there is
 * something in here you have not got yet" — exactly what a milestone is.
 */
function QuestionBlock() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      className="block-bob"
      aria-hidden
    >
      <rect width="24" height="24" fill="#0a0a0a" />
      <rect x="3" y="3" width="18" height="18" fill="#e39b1f" />
      <rect x="3" y="3" width="18" height="3" fill="#fbd000" />
      <rect x="3" y="3" width="3" height="18" fill="#fbd000" />
      {/* The studs in the corners. */}
      <g fill="#0a0a0a">
        <rect x="6" y="6" width="3" height="3" />
        <rect x="15" y="6" width="3" height="3" />
        <rect x="6" y="15" width="3" height="3" />
        <rect x="15" y="15" width="3" height="3" />
      </g>
      {/* The question mark, on the same 3px grid as everything else. */}
      <g fill="#0a0a0a">
        <rect x="9" y="8" width="6" height="2" />
        <rect x="13" y="10" width="2" height="2" />
        <rect x="11" y="12" width="2" height="2" />
        <rect x="11" y="16" width="2" height="2" />
      </g>
    </svg>
  );
}
