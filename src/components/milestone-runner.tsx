import { cn } from "@/lib/utils";

/**
 * The progress bar with somebody on it.
 *
 * A filled rectangle tells you a number you have already read on the line
 * above. Putting a runner on the track says the same thing in a way you feel:
 * there is a distance, you are somewhere along it, and the flag at the end is
 * a place you arrive at rather than a percentage you reach.
 *
 * The first version was a thin stick figure at 40px, and at that size
 * overlapping 2px limbs read as a smudge rather than a person. What fixed it
 * was not more animation — it was silhouette: a bigger head, a filled torso,
 * limbs thick enough to stay separate, shoes, and the far arm and leg in flat
 * grey instead of a translucent ghost. A shape you recognise in a single frame
 * is worth more than a clever cycle you cannot make out.
 *
 * All motion is CSS. The bar and the runner share one duration and one easing,
 * so the runner arrives exactly as the fill stops; nothing here needs an
 * effect, a timer, or a re-render.
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
    <div className={cn("relative pt-20 text-ink", className)}>
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
        className="run-to absolute bottom-4 mb-[-6px] w-0 sm:bottom-5"
        style={{ "--run-to": `${marker}%` } as React.CSSProperties}
        aria-hidden
      >
        <div className="-translate-x-1/2">
          <Runner />
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

/** Rotation about a joint, in the SVG's own coordinates. */
function joint(x: number, y: number): React.CSSProperties {
  return { transformBox: "view-box", transformOrigin: `${x}px ${y}px` };
}

/** Thigh and shin, hinged at the knee inside the thigh's rotated space. */
function Leg({ back }: { back?: boolean }) {
  const late = back ? " runner-late" : "";
  return (
    <g
      className={`runner-leg${late}`}
      style={joint(24, 35)}
      stroke="var(--color-ink)"
      opacity={back ? 0.28 : 1}
    >
      <path d="M24 35 L24 45" strokeWidth="5" strokeLinecap="round" />
      <g className={`runner-shin${late}`} style={joint(24, 45)}>
        <path d="M24 45 L24 54" strokeWidth="5" strokeLinecap="round" />
        {/* The shoe. Without it the leg ends in a point and the figure floats. */}
        <path d="M23 55 L30 55" strokeWidth="4.5" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** Upper arm and forearm, hinged at the elbow. */
function Arm({ back }: { back?: boolean }) {
  const late = back ? " runner-late" : "";
  return (
    <g
      className={`runner-arm${late}`}
      style={joint(26, 21)}
      stroke="var(--color-ink)"
      opacity={back ? 0.28 : 1}
    >
      <path d="M26 21 L23 30" strokeWidth="4.5" strokeLinecap="round" />
      <g className={`runner-forearm${late}`} style={joint(23, 30)}>
        <path d="M23 30 L28 36" strokeWidth="4.5" strokeLinecap="round" />
      </g>
    </g>
  );
}

/**
 * The runner.
 *
 * The thing that separates a running figure from a scissoring stick is the
 * knee. Each leg is two segments — thigh from the hip, shin from the knee —
 * and the shin group is nested inside the thigh group, so bending the knee
 * happens in the thigh's rotated space, exactly as a leg does.
 *
 * One keyframe set drives both sides; the far arm and leg just start half a
 * stride late, via a negative delay. The arms run half a stride from the leg
 * on their own side, so opposite arm meets opposite leg — the diagonal that
 * reads as running rather than as hopping.
 */
function Runner() {
  return (
    <svg
      width="58"
      height="72"
      viewBox="0 0 48 60"
      fill="none"
      className="overflow-visible"
    >
      {/* Contact shadow. Widest when the weight is on the ground. */}
      <ellipse
        className="runner-shadow"
        cx="26"
        cy="57"
        rx="9"
        ry="2"
        fill="currentColor"
        opacity="0.15"
        style={joint(26, 57)}
      />

      <g className="runner-bob">
        {/* Far side first, so it sits behind everything else. */}
        <Leg back />
        <Arm back />

        {/* Shirt, then shorts. Filled shapes rather than outlines: this is the
            silhouette that makes the whole thing legible at this size. */}
        <path
          d="M27 19 L25 31"
          stroke="var(--color-brand-strong)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M25 32 L24 35"
          stroke="var(--color-ink)"
          strokeWidth="12"
          strokeLinecap="round"
        />

        <Leg />
        <Arm />

        {/* Head last, so every join sits under it. */}
        <circle cx="30" cy="10" r="7.5" fill="var(--color-ink)" />
        <path d="M34 4 Q40 2 37 8" fill="var(--color-ink)" />
      </g>
    </svg>
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
        style={joint(3, 8.5)}
      />
    </svg>
  );
}
