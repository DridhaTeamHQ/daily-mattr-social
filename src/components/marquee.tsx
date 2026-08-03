import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Scrolling tape band.
 *
 * Rendered in HTML rather than as an image: it stays razor-sharp at any width,
 * costs no bytes, and the wordmark is real text — spelled right every time and
 * readable by a screen reader, which a generated banner can promise neither of.
 *
 * The content is duplicated once and the track translates exactly -50%, so the
 * second copy lands where the first began and the loop is seamless. Anything
 * other than an exact 50% shows a visible jump every cycle.
 */
export function Marquee({
  items,
  className,
  tone = "ink",
}: {
  items: string[];
  className?: string;
  tone?: "ink" | "brand" | "reel";
}) {
  const skin = {
    ink: "bg-ink text-brand",
    brand: "bg-brand text-ink",
    reel: "bg-reel text-ink",
  }[tone];

  return (
    <div
      aria-hidden
      className={cn(
        "relative flex overflow-hidden border-y-[3px] border-ink py-2.5 select-none",
        skin,
        className,
      )}
    >
      <div className="animate-marquee flex shrink-0 items-center gap-6 pr-6">
        {[...items, ...items].map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="display flex shrink-0 items-center gap-6 text-[15px] whitespace-nowrap sm:text-[18px]"
          >
            {item}
            <Star />
          </span>
        ))}
      </div>
    </div>
  );
}

/** A chunky five-point star, matching the sticker doodles. */
function Star() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="currentColor">
      <path d="M12 0l3.1 8.2L24 9.2l-6.5 5.6 2 8.8L12 18.9 4.5 23.6l2-8.8L0 9.2l8.9-1z" />
    </svg>
  );
}
