import { Skeleton } from "@/components/ui/feedback";
import {
  LoadingLabel,
  PageHeaderSkeleton,
  StatSkeleton,
} from "@/components/skeletons";

/**
 * Fallback for the reward structure page.
 *
 * Shaped like `rewards/page.tsx`: the outline header, two stat tiles
 * (completion and stipend), then the achievements card.
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

      {/* Achievements */}
      <div className="rounded-xl border border-gray-200 bg-surface p-5 shadow-sm">
        <Skeleton className="h-4 w-40 rounded-sm" />
        <Skeleton className="mt-2 h-3.5 w-full max-w-xs rounded-sm" />

        <div className="mt-5 space-y-2.5">
          {[0, 1].map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3.5"
            >
              <Skeleton className="size-9 shrink-0 rounded-full bg-gray-200" />
              <div className="w-full space-y-2">
                <Skeleton className="h-4 w-56 rounded-sm bg-gray-200" />
                <Skeleton className="h-3.5 w-28 rounded-sm bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
