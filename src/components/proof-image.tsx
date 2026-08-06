"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A screenshot you can actually inspect.
 *
 * Reviewing a submission means reading an 11px handle and telling a filled
 * heart from an outlined one. In a 15rem-wide column that is guesswork, and
 * guesswork is how a genuine upload gets rejected — the failure this app has
 * already had once.
 *
 * Click to open full screen, then zoom and drag. Double-click toggles between
 * fit and 2x, which is the gesture people try first.
 */
export function ProofImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative block w-full overflow-hidden rounded-sm",
          "cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          className,
        )}
        aria-label={`${alt} — open full size`}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 15rem"
          className="object-contain"
          unoptimized
        />

        <span
          aria-hidden
          className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-lg bg-ink/70 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Maximize2 className="size-4" />
        </span>
      </button>

      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const drag = React.useRef<{ x: number; y: number } | null>(null);
  // Mirrored in state because the transform's transition depends on it, and a
  // ref read during render does not re-render when it changes.
  const [dragging, setDragging] = React.useState(false);

  const clamp = (n: number) => Math.min(6, Math.max(1, n));

  // Escape closes, arrows are left to the browser. Bound to the document
  // because the overlay is not what holds focus after a zoom button is used.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);

    // The page behind must not scroll while a full-screen layer is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  function zoom(delta: number) {
    setScale((current) => {
      const next = clamp(current + delta);
      // Snapping back to centre at 1x stops the image drifting off-screen
      // after a zoom-out, which otherwise leaves an apparently blank overlay.
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }

  // Portalled to <body>. The review cards animate in with a transform, and a
  // transformed ancestor becomes the containing block for position: fixed —
  // which pinned the "full screen" overlay to the card it opened from.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex flex-col bg-ink/95"
      onClick={onClose}
    >
      {/* ─── Controls ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="truncate text-[13px] font-bold text-white/80">{alt}</p>

        <div className="flex items-center gap-1.5">
          <Control onClick={() => zoom(-0.5)} label="Zoom out" disabled={scale <= 1}>
            <Minus className="size-4" />
          </Control>
          <span className="w-12 text-center text-[12.5px] font-bold text-white/80">
            {Math.round(scale * 100)}%
          </span>
          <Control onClick={() => zoom(0.5)} label="Zoom in" disabled={scale >= 6}>
            <Plus className="size-4" />
          </Control>
          <Control
            onClick={() => {
              setScale(1);
              setOffset({ x: 0, y: 0 });
            }}
            label="Reset zoom"
            disabled={scale === 1 && offset.x === 0 && offset.y === 0}
          >
            <RotateCcw className="size-4" />
          </Control>
          <Control onClick={onClose} label="Close">
            <X className="size-4" />
          </Control>
        </div>
      </div>

      {/* ─── Image ─────────────────────────────────────────────────────────── */}
      <div
        className="relative flex-1 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => zoom(e.deltaY > 0 ? -0.25 : 0.25)}
        onDoubleClick={() => {
          setScale((s) => (s > 1 ? 1 : 2));
          setOffset({ x: 0, y: 0 });
        }}
        onPointerDown={(e) => {
          if (scale <= 1) return;
          drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setOffset({
            x: e.clientX - drag.current.x,
            y: e.clientY - drag.current.y,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        style={{ cursor: scale > 1 ? "grab" : "zoom-in" }}
      >
        {/* A plain img, not next/image: this is a signed one-off URL being
            transformed, and the optimizer adds nothing but a proxy hop. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain select-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 120ms ease-out",
          }}
        />
      </div>

      <p className="p-4 text-center text-[12px] font-semibold text-white/50">
        Scroll to zoom · drag to move · double-click to fit · Esc to close
      </p>
    </div>,
    document.body,
  );
}

function Control({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-white/10"
    >
      {children}
    </button>
  );
}
