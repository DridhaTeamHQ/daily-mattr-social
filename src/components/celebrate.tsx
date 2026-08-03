"use client";

import * as React from "react";

/**
 * Confetti and count-up animations.
 *
 * Hand-rolled rather than pulled from a package: this is ~60 lines of canvas,
 * and a confetti dependency would cost more kilobytes than the whole feature
 * is worth on a student's phone data plan.
 *
 * Everything here checks `prefers-reduced-motion` and degrades to the final
 * state immediately — celebration should never be the reason someone feels ill.
 */

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  colour: string;
};

const COLOURS = ["#6d28d9", "#db2777", "#ea580c", "#f59e0b", "#0d9488", "#7c3aed"];

/**
 * Fires a burst of confetti over the whole viewport.
 *
 * Mounted once near the root and driven by `useCelebration()`, so any part of
 * the tree can trigger it without threading refs around.
 */
export function ConfettiCanvas({ fireKey }: { fireKey: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const frameRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    if (fireKey === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    if (prefersReducedMotion()) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    context.scale(dpr, dpr);

    // Two launchers, angled inwards from the bottom corners — reads as
    // celebration rather than as something falling apart above you.
    const particles: Particle[] = [];
    for (const origin of [0.15, 0.85]) {
      for (let i = 0; i < 60; i++) {
        const angle = (Math.random() * Math.PI) / 3 + (origin < 0.5 ? -Math.PI / 3 : -Math.PI / 1.5);
        const speed = 9 + Math.random() * 9;
        particles.push({
          x: width * origin,
          y: height + 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 12,
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.3,
          size: 6 + Math.random() * 6,
          colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
        });
      }
    }

    let elapsed = 0;
    function tick() {
      elapsed += 1;
      context!.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.vy += 0.32; // gravity
        p.vx *= 0.995; // drag
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;

        context!.save();
        context!.translate(p.x, p.y);
        context!.rotate(p.rotation);
        context!.fillStyle = p.colour;
        context!.globalAlpha = Math.max(0, 1 - elapsed / 170);
        context!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        context!.restore();
      }

      if (elapsed < 170) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        context!.clearRect(0, 0, width, height);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [fireKey]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60]"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

// ─── Celebration context ────────────────────────────────────────────────────

const CelebrationContext = React.createContext<() => void>(() => {});

export function CelebrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [fireKey, setFireKey] = React.useState(0);
  const celebrate = React.useCallback(() => setFireKey((n) => n + 1), []);

  return (
    <CelebrationContext.Provider value={celebrate}>
      {children}
      <ConfettiCanvas fireKey={fireKey} />
    </CelebrationContext.Provider>
  );
}

/** Call the returned function to fire confetti from anywhere in the tree. */
export function useCelebration() {
  return React.useContext(CelebrationContext);
}

// ─── Count-up ───────────────────────────────────────────────────────────────

/**
 * Counts from 0 to `value` on mount.
 *
 * Ease-out over a fixed duration rather than a fixed step, so 40 points and
 * 4,000 points both take the same satisfying beat.
 */
export function CountUp({
  value,
  durationMs = 900,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = React.useState(value);
  const [lastValue, setLastValue] = React.useState(value);

  // Render-phase adjustment, not an effect: when the number changes and motion
  // is suppressed, jump straight to the new value. Starting at `value` also
  // means the server and the first client render agree, so there is no
  // hydration mismatch and no flash of "0".
  if (lastValue !== value) {
    setLastValue(value);
    if (prefersReducedMotion()) setDisplay(value);
  }

  React.useEffect(() => {
    if (prefersReducedMotion() || value === 0) return;

    let frame: number;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <span className={className}>
      {new Intl.NumberFormat("en-US").format(display)}
    </span>
  );
}
