import { CardSkeleton, LoadingLabel, PageHeaderSkeleton, StatSkeleton } from "@/components/skeletons";

/**
 * Fallback for one ambassador.
 *
 * Shaped like `[id]/page.tsx`: the brand header, three stat tiles, the
 * completion track, then submissions and survey links side by side. Without
 * it, opening someone from the list left the old page frozen on screen until
 * every query had come back, which read as the app hanging.
 */
export default function AmbassadorDetailLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <LoadingLabel />

      <PageHeaderSkeleton tone="brand" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>

      <CardSkeleton className="h-44" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CardSkeleton className="h-64" />
        <CardSkeleton className="h-64" />
      </div>
    </div>
  );
}
