import { Skeleton } from "@/components/ui/feedback";
import { LoadingLabel, PageHeaderSkeleton } from "@/components/skeletons";

/**
 * Fallback for the surveys list.
 *
 * Shaped like `surveys/page.tsx`: the outline poll-toned header, the note about
 * links being personal, then one card per survey — two metric tiles, the link
 * bar, and the copy/preview buttons.
 */
export default function SurveysLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <LoadingLabel />

      <PageHeaderSkeleton tone="poll" variant="outline" />

      {/* The note above the list */}
      <div className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3">
        <Skeleton className="mt-0.5 size-5 shrink-0 rounded-full" />
        <Skeleton className="h-3.5 w-full max-w-lg rounded-sm" />
      </div>

      {[0, 1].map((card) => (
        <div
          key={card}
          className="overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-sm"
        >
          {/* Card head: survey title and its headline counts */}
          <div className="flex items-start justify-between gap-4 p-6">
            <Skeleton className="h-5 w-56 rounded-sm" />
            <Skeleton className="h-7 w-20 shrink-0 rounded-full" />
          </div>

          <div className="px-6 pb-6">
            {/* Clicks / Responses */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[0, 1].map((metric) => (
                <div
                  key={metric}
                  className="flex items-center gap-4 rounded-xl bg-gray-100 px-6 py-5"
                >
                  <Skeleton className="size-12 shrink-0 rounded-full bg-gray-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-7 w-14 rounded-sm bg-gray-200" />
                    <Skeleton className="h-3 w-20 rounded-sm bg-gray-200" />
                  </div>
                </div>
              ))}
            </div>

            {/* The share link */}
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <Skeleton className="size-4 shrink-0 rounded-sm bg-gray-200" />
              <Skeleton className="h-4 w-full max-w-sm rounded-sm bg-gray-200" />
            </div>

            {/* Copy / Preview */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Skeleton className="h-10 w-32 rounded-lg" />
              <Skeleton className="h-10 w-28 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
