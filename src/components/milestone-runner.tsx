import { cn } from "@/lib/utils";

/**
 * The progress bar with somebody on it.
 *
 * A filled rectangle tells you a number you have already read two lines above.
 * Putting a runner on the track says the same thing in a way you feel: there is
 * a distance, you are somewhere along it, and the flag at the end is a place
 * you arrive at rather than a percentage you reach.
 *
 * Drawn here rather than fetched. A downloaded sprite would be one more asset
 * to ship, one more licence to honour, and a picture that cannot take the
 * app's own ink and brand colours — this is thirty lines of SVG that inherit
 * both, weigh nothing, and stay crisp at any size.
 *
 * All motion is CSS. The bar and the runner share one timing function and one
 * duration, so the runner arrives exactly as the fill stops; nothing here
 * needs an effect, a timer, or a re-render.
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

  // The runner is drawn from their feet up and centred on their own position,
  // so at the extremes half of them would hang off the track. Keeping the
  // marker between 3% and 97% costs a couple of pixels of accuracy and buys a
  // figure that is always whole.
  const marker = Math.max(3, Math.min(97, clamped));

  return (
    // Ink, not brand: the runner stands at the head of a brand-coloured fill,
    // and a blue figure on a blue bar is a figure nobody can see.
    <div className={cn("relative pt-9 text-ink", className)}>
      {/* ─── Runner ────────────────────────────────────────────────────────── */}
      <div
        className="run-to absolute bottom-full mb-[-3px] w-0"
        style={{ "--run-to": `${marker}%` } as React.CSSProperties}
        aria-hidden
      >
        <div className="runner-bob -translate-x-1/2">
          <Runner />
        </div>
      </div>

      {/* ─── Track ─────────────────────────────────────────────────────────── */}
      <div className="relative h-4 w-full overflow-hidden rounded-full border border-gray-200/60 bg-gray-100 p-0.5 sm:h-5">
        <div
          className="fill-to h-full rounded-full bg-brand-strong shadow-xs"
          style={{ "--fill-to": `${clamped}%` } as React.CSSProperties}
        />
      </div>

      {/* ─── Finish line ───────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute right-0 bottom-full mb-0.5" aria-hidden>
        <Flag />
      </div>
    </div>
  );
}

/**
 * The runner.
 *
 * A stick figure with weight: thick round-capped strokes, a head that clears
 * the shoulders, and limbs that swing from a single joint each. Legs and arms
 * run on the same two keyframes in opposite phase, which is the whole trick —
 * arms and legs crossing is what reads as running rather than as a figure
 * being shaken.
 */
function Runner() {
  return (
    <svg
      width="26"
      height="30"
      viewBox="0 0 26 30"
      fill="none"
      className="overflow-visible"
    >
      {/* Dust kicked up behind the back foot. */}
      <circle className="runner-dust" cx="4" cy="28" r="2" fill="currentColor" opacity="0.18" />
      <circle
        className="runner-dust runner-dust-late"
        cx="1"
        cy="27"
        r="1.4"
        fill="currentColor"
        opacity="0.14"
      />

      <g
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Legs, from the hip. */}
        <g style={{ transformOrigin: "13px 19px" }} className="runner-limb-a">
          <path d="M13 19 L9 27" />
        </g>
        <g style={{ transformOrigin: "13px 19px" }} className="runner-limb-b">
          <path d="M13 19 L18 26" />
        </g>

        {/* Torso, leaning into the run. */}
        <path d="M15 10 L13 19" />

        {/* Arms, from the shoulder, opposite the legs. */}
        <g style={{ transformOrigin: "14px 12px" }} className="runner-limb-b">
          <path d="M14 12 L9 15" />
        </g>
        <g style={{ transformOrigin: "14px 12px" }} className="runner-limb-a">
          <path d="M14 12 L20 14" />
        </g>
      </g>

      {/* Head last, so the stroke joins sit under it. */}
      <circle cx="16.5" cy="6" r="4.2" fill="currentColor" />
    </svg>
  );
}

/** The thing being run at. Waves on its own, gently. */
function Flag() {
  return (
    <svg width="16" height="22" viewBox="0 0 16 22" fill="none">
      <path
        d="M3 21 L3 2"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        className="flag-wave"
        d="M3 3 L14 6.5 L3 10 Z"
        fill="currentColor"
        style={{ transformOrigin: "3px 6.5px" }}
      />
    </svg>
  );
}
