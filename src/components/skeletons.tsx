import { Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/**
 * The shapes the ambassador screens are built from, with the content taken
 * out.
 *
 * A route-level `loading.tsx` is only worth having if it is the same size as
 * the page it stands in for. One generic skeleton served every screen under
 * /dashboard, so a tap on Surveys drew a dashboard hero, then threw it away and
 * reflowed to a list — which reads as two loads rather than one. These mirror
 * the real components closely enough that the swap is invisible: same
 * container, same radius, same heights, same grid.
 *
 * They are deliberately dumb: no props that change what a page looks like, no
 * data. If a page's layout changes, its skeleton has to change with it — that
 * is the cost of the illusion, and the reason each one names the component it
 * is standing in for.
 */

type Tone = "brand" | "reel" | "poll" | "invite" | "rank";

const FILL: Record<Tone, string> = {
  brand: "bg-brand",
  reel: "bg-reel",
  poll: "bg-poll",
  invite: "bg-invite",
  rank: "bg-rank",
};

/** Stands in for `<PageHeader>`. Same padding, same icon size, same radius. */
export function PageHeaderSkeleton({
  tone,
  variant = "solid",
  className,
}: {
  tone: Tone;
  variant?: "solid" | "outline";
  className?: string;
}) {
  const solid = variant === "solid";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-[14px] p-5 shadow-sm",
        solid ? FILL[tone] : "border border-gray-200 bg-white",
        className,
      )}
    >
      {/* The icon tile keeps its real colour: it is the one part of the header
          that is known before the data arrives, so blanking it would be a
          flicker rather than a placeholder. */}
      <span
        aria-hidden
        className={cn(
          "shrink-0",
          solid
            ? "size-12 rounded-xl bg-white/80"
            : cn("size-14 rounded-full opacity-80", FILL[tone]),
        )}
      />

      <div className="min-w-0 flex-1 space-y-2.5">
        <Skeleton
          className={cn("h-5 w-44 rounded-sm", solid && "bg-white/55")}
        />
        <Skeleton
          className={cn(
            "h-3.5 w-full max-w-md rounded-sm",
            solid && "bg-white/35",
          )}
        />
      </div>
    </div>
  );
}

/** Stands in for `<Card>` — the plain white panel most lists sit in. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-surface shadow-sm",
        className,
      )}
    />
  );
}

/**
 * Stands in for one of the four tiles in `<ProgressHero>`: label and icon on
 * the top row, a big number under it, a caption under that.
 */
export function ProgressTileSkeleton() {
  return (
    <div className="flex flex-col justify-between space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24 rounded-sm" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <div>
        <Skeleton className="h-8 w-20 rounded-sm" />
        <Skeleton className="mt-2 h-3 w-28 rounded-sm" />
      </div>
    </div>
  );
}

/**
 * Stands in for `<Stat>`, which is a different card from the tile above — the
 * icon is a large square on the left, and the label sits over the number rather
 * than beside it.
 */
export function StatSkeleton() {
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-gray-100 bg-gray-50/50 p-5 shadow-sm sm:p-6">
      <Skeleton className="size-14 shrink-0 rounded-2xl bg-gray-200" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3 w-20 rounded-sm bg-gray-200" />
        <Skeleton className="h-7 w-24 rounded-sm bg-gray-200" />
        <Skeleton className="h-3 w-28 rounded-sm bg-gray-200" />
      </div>
    </div>
  );
}

/** Stands in for the `<SectionHeader>` above each dashboard block. */
export function SectionHeaderSkeleton({ width = "w-32" }: { width?: string }) {
  return <Skeleton className={cn("mb-4 ml-1 h-3.5 rounded-sm", width)} />;
}

/** The screen-reader half of every fallback below. */
export function LoadingLabel() {
  return <span className="sr-only">Loading…</span>;
}
