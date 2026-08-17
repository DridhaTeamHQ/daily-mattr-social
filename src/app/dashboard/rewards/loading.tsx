import { Skeleton } from "@/components/ui/feedback";
import {
  LoadingLabel,
  PageHeaderSkeleton,
  StatSkeleton,
} from "@/components/skeletons";

/**
 * Fallback for stipend progress.
 *
 * Shaped like `rewards/page.tsx`: the outline header, two stat tiles
 * (completion and stipend), then the programme terms card — a couple of
 * criterion rows and the stipend banner.
 */
export default function RewardsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <LoadingLabel />

      <PageHeaderSkeleton
        tone="brand"
        variant="outline"
        className="bg-gray-50"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <StatSkeleton key={i} />
        ))}
      </div>

      {/* Programme terms */}
      <div className="rounded-xl border border-gray-200 bg-surface p-5 shadow-sm">
        <Skeleton className="h-4 w-40 rounded-sm" />
        <Skeleton className="mt-2 h-3.5 w-full max-w-lg rounded-sm" />

        <div className="mt-5 space-y-3">
          {[0, 1].map((row) => (
            <div
              key={row}
              className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-4 py-3.5"
            >
              <Skeleton className="h-4 w-56 rounded-sm bg-gray-200" />
              <Skeleton className="h-3.5 w-28 shrink-0 rounded-sm bg-gray-200" />
            </div>
          ))}

          {/* The stipend banner, which keeps its colour — the amount is the
              only part of it that is unknown while loading. */}
          <div className="flex items-center justify-between gap-4 rounded-xl bg-brand px-4 py-4">
            <Skeleton className="h-4 w-36 rounded-sm bg-white/40" />
            <Skeleton className="h-5 w-20 shrink-0 rounded-sm bg-white/40" />
          </div>
        </div>

        <Skeleton className="mt-4 h-3.5 w-full max-w-sm rounded-sm" />
      </div>
    </div>
  );
}
