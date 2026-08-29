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
/**
 * Where the coins sit along the track.
 *
 * A coin is a tier: the name goes over it, so the run has named places on it
 * rather than four identical pickups. Callers that know the tiers pass them
 * in; the fallback is the same four stops with nothing written on them.
 */
export type MilestoneStop = { at: number; name?: string };

const COIN_STOPS: MilestoneStop[] = [{ at: 30 }, { at: 50 }, { at: 70 }, { at: 86 }];

export function MilestoneProgress({
  pct,
  stops = COIN_STOPS,
  finish,
  marks,
  className,
}: {
  /** 0–100. How far along the track they are. */
  pct: number;
  /** The coins, in order. Ones already run past are dropped. */
  stops?: MilestoneStop[];
  /** The name over the flag — the last tier, the one the run ends at. */
  finish?: string;
  /** Percentages painted on the track itself. Empty leaves it plain. */
  marks?: number[];
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));

  // The runner is centred on their own position, so at the extremes half of
  // them would hang off the track. Keeping the marker between 4% and 93%
  // costs a couple of pixels of accuracy and buys a figure that is always
  // whole and never standing inside the flag.
  const marker = Math.max(4, Math.min(93, clamped));

  return (
    <div className={cn("relative pt-24 text-ink", className)}>
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

        {/* ─── The scale ───────────────────────────────────────────────────
            Painted on the ground rather than hung under it: the card has no
            room below the bar, and a number on the track is where a distance
            marker belongs anyway. The ends are pinned to their edges instead
            of centred on them, so 0 and 100 stay on the track rather than
            half off it. */}
        {marks?.map((at) => (
          <span
            key={at}
            className={cn(
              "track-mark pointer-events-none absolute top-1/2 -translate-y-1/2",
              at === 0 ? "left-1" : at === 100 ? "right-1" : "-translate-x-1/2",
            )}
            style={at > 0 && at < 100 ? { left: `${at}%` } : undefined}
            aria-hidden
          >
            {at}%
          </span>
        ))}
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
        {stops
          .filter((stop) => stop.at > marker + 6)
          .map((stop) => (
            <span
              key={stop.at}
              className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center gap-1"
              style={{ left: `${stop.at}%` }}
            >
              {stop.name && <span className="tier-tag">{stop.name}</span>}
              <Coin />
            </span>
          ))}
      </div>

      {/* ─── Finish line ─────────────────────────────────────────────────────
          The block sits above the flag rather than beside it, so the last
          thing on the track is the thing being run at. */}
      <div
        className="pointer-events-none absolute right-0 bottom-4 flex flex-col items-center gap-1 sm:bottom-5"
        aria-hidden
      >
        {finish && <span className="tier-tag">{finish}</span>}
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
 * pixel sprite without one of them looking anti-aliased. There is no text on
 * the card beyond the tier names over the coins: the percentage, the tier and
 * the task count are all spelled out on the tiles directly above it, and a
 * scene that repeats them is a scene you read instead of look at.
 */
export function MilestoneLevel({
  pct,
  stops,
  finish,
  marks,
}: {
  pct: number;
  /** The tiers still ahead, drawn as named coins along the track. */
  stops?: MilestoneStop[];
  /** The tier the flag stands for. */
  finish?: string;
  /** Every tier's percentage, painted along the track. */
  marks?: number[];
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

      <MilestoneProgress
        pct={pct}
        stops={stops}
        finish={finish}
        marks={marks}
        className="relative"
      />
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
