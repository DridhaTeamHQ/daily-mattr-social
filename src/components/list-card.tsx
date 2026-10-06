import Link from "next/link";
import { ChevronLeft, ChevronRight, Megaphone } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The pieces the admin list pages share — Tasks and Surveys draw their cards
 * from the same parts, so the two lists read as one design.
 */

/**
 * The network a campaign runs on, as a small logo tile in its own colours.
 *
 * Colour is what lets a grid of these be scanned without reading: pink-orange
 * is Instagram, red is YouTube, blue is LinkedIn. Lucide ships no brand marks,
 * so the glyphs are drawn here — simple enough to recognise at 20px and no
 * more. Anything unrecognised gets a neutral megaphone.
 */
export function PlatformTile({ platform }: { platform: string | null }) {
  const base =
    "grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-sm";

  switch (platform) {
    case "Instagram":
      return (
        <span
          title="Instagram"
          className={base}
          style={{
            background:
              "radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%)",
          }}
        >
          <svg viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>
      );
    case "YouTube":
      return (
        <span title="YouTube" className={cn(base, "bg-[#ff0033]")}>
          <svg viewBox="0 0 24 24" className="size-5.5" aria-hidden>
            <rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" />
            <path d="M10 9l5 3-5 3z" fill="#ff0033" />
          </svg>
        </span>
      );
    case "LinkedIn":
      return (
        <span title="LinkedIn" className={cn(base, "bg-[#0a66c2] text-[17px] font-black tracking-tight")}>
          in
        </span>
      );
    case "X":
      return (
        <span title="X" className={cn(base, "bg-black text-[17px] font-black")}>
          𝕏
        </span>
      );
    default:
      return (
        <span title={platform ?? "Other"} className={cn(base, "bg-gradient-to-br from-slate-500 to-slate-700")}>
          <Megaphone className="size-5" aria-hidden />
        </span>
      );
  }
}

/** Live is green and pulsing; everything else is a quiet grey. */
export function StatusPill({ status }: { status: string }) {
  const live = status === "live";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold capitalize",
        live
          ? "bg-emerald-50 text-emerald-700"
          : status === "draft"
            ? "bg-amber-50 text-amber-700"
            : "bg-gray-100 text-ink-soft",
      )}
    >
      <span className="relative flex size-1.5">
        {live && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex size-1.5 rounded-full",
            live ? "bg-emerald-500" : status === "draft" ? "bg-amber-500" : "bg-gray-400",
          )}
        />
      </span>
      {status}
    </span>
  );
}

/**
 * How many finished, as a ring with the percentage inside.
 *
 * Coloured by how it is going — green from 70%, amber from 40%, red below —
 * so the cards that need chasing stand out from across the grid.
 */
export function CompletionRing({
  done,
  of,
  title,
}: {
  done: number;
  of: number;
  /** Hover text; defaults to the campaign reading. */
  title?: string;
}) {
  const pct = of ? Math.min(100, Math.round((done * 100) / of)) : 0;
  const color = pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#f43f5e";
  // A circle whose circumference is 100, so the dash length is the percent.
  const radius = 15.9155;

  return (
    <div
      className="relative size-12 shrink-0"
      title={title ?? `${done} of ${of} active ambassadors completed`}
    >
      <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={radius} fill="none" stroke="#f1f1f3" strokeWidth="3.5" />
        {pct > 0 && (
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${pct} ${100 - pct}`}
          />
        )}
      </svg>
      <span className="tabular absolute inset-0 grid place-items-center text-[11.5px] font-extrabold text-ink">
        {pct}%
      </span>
    </div>
  );
}

/**
 * Page links under the list: previous, the page numbers, next.
 *
 * Plain links, so every page is a URL — reloadable, shareable, and the back
 * button steps through them. Long runs are cut to the first, the last and
 * the pages either side of the current one.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  shown,
  noun,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  shown: number;
  /** What the list holds, plural: "campaigns". */
  noun: string;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const pages: (number | "gap")[] = [];
  for (let n = 1; n <= pageCount; n++) {
    if (n === 1 || n === pageCount || Math.abs(n - page) <= 1) pages.push(n);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }

  const step =
    "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-3 text-[13.5px] font-bold transition-colors";

  return (
    // Centred, on its own bar, with room underneath: pushed to the right edge
    // it sat exactly where the floating Ask button is pinned, which hid Next.
    <nav
      aria-label="Pages"
      className="flex flex-col items-center gap-2 pt-2 pb-20"
    >
      <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-surface p-1 shadow-xs">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={cn(step, "text-ink hover:bg-gray-100")}>
            <ChevronLeft className="size-4" aria-hidden />
            Prev
          </Link>
        ) : (
          <span className={cn(step, "text-ink-faint")}>
            <ChevronLeft className="size-4" aria-hidden />
            Prev
          </span>
        )}

        {pages.map((n, index) =>
          n === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-ink-faint">
              …
            </span>
          ) : (
            <Link
              key={n}
              href={hrefFor(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                step,
                "tabular",
                n === page ? "bg-ink text-white" : "text-ink hover:bg-gray-100",
              )}
            >
              {n}
            </Link>
          ),
        )}

        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className={cn(step, "text-ink hover:bg-gray-100")}>
            Next
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={cn(step, "text-ink-faint")}>
            Next
            <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>

      <p className="tabular text-[12px] text-ink-soft">
        Showing {first}–{first + shown - 1} of {total} {noun}
      </p>
    </nav>
  );
}

/** 1, 2, 3 in medal colours; everyone else plain. */
export function RankMark({ rank }: { rank: number | null }) {
  if (rank === null) {
    return (
      <span className="grid size-7 shrink-0 place-items-center text-[13px] font-bold text-ink-faint">
        —
      </span>
    );
  }
  const medal =
    rank === 1
      ? "bg-amber-400 text-ink"
      : rank === 2
        ? "bg-gray-300 text-ink"
        : rank === 3
          ? "bg-orange-300 text-ink"
          : "text-ink-faint";
  return (
    <span
      aria-label={`Rank ${rank}`}
      className={cn(
        "tabular grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-black",
        medal,
      )}
    >
      {rank}
    </span>
  );
}
