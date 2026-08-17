import { Skeleton } from "@/components/ui/feedback";
import {
  LoadingLabel,
  ProgressTileSkeleton,
  SectionHeaderSkeleton,
  StatSkeleton,
} from "@/components/skeletons";

/**
 * Fallback for the ambassador home page.
 *
 * Shaped like `dashboard/page.tsx`: greeting, "Your progress" over four stat
 * cards and the tier strip, then "Your tasks" over three more. It also covers
 * any child route that has no `loading.tsx` of its own, so the ones that look
 * nothing like this — campaigns, surveys, leaderboard, rewards, installs — each
 * carry their own.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-7" aria-busy="true" aria-live="polite">
      <LoadingLabel />

      {/* Greeting */}
      <header>
        <Skeleton className="h-8 w-56 rounded-sm sm:h-9" />
        <Skeleton className="mt-2 h-4 w-full max-w-lg rounded-sm" />
      </header>

      {/* Your progress */}
      <section>
        <SectionHeaderSkeleton width="w-28" />
        <div className="space-y-7">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <ProgressTileSkeleton key={i} />
              ))}
            </div>
            {/* The milestone band, which is a wide graphic rather than text. */}
            <Skeleton className="h-40 rounded-2xl sm:h-48" />
          </div>

          {/* Tier strip */}
          <div className="flex gap-2 overflow-hidden pt-1 pb-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton
                key={i}
                className="h-9 w-36 shrink-0 rounded-full border border-gray-200 bg-white"
              />
            ))}
          </div>
        </div>
      </section>

      {/* Your tasks */}
      <section>
        <SectionHeaderSkeleton width="w-24" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
