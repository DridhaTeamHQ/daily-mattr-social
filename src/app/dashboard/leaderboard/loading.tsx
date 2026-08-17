import { Skeleton } from "@/components/ui/feedback";
import { LoadingLabel, PageHeaderSkeleton } from "@/components/skeletons";

/**
 * Fallback for the completion leaderboard.
 *
 * Shaped like `leaderboard/page.tsx`: the outline rank-toned header, the line
 * explaining the formula, then one card holding a divided list of rows —
 * position, avatar, name and college, percentage.
 *
 * Ten rows: the page shows up to twenty, but a fallback longer than the real
 * list would shrink on arrival, and ten is already past the fold on a phone.
 */
export default function LeaderboardLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <LoadingLabel />

      <PageHeaderSkeleton
        tone="rank"
        variant="outline"
        className="bg-gray-50"
      />

      {/* The formula line */}
      <div className="rounded-xl border border-brand/20 bg-brand-tint/50 px-4 py-3">
        <Skeleton className="h-4 w-full max-w-md rounded-sm bg-brand/15" />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-sm">
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-36 rounded-sm" />
                <Skeleton className="h-3 w-24 rounded-sm" />
              </div>
              <div className="shrink-0 space-y-1.5 text-right">
                <Skeleton className="ml-auto h-8 w-16 rounded-lg" />
                <Skeleton className="ml-auto h-3 w-20 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
