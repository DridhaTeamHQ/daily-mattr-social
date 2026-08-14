import { Skeleton } from "@/components/ui/feedback";
import { LoadingLabel, PageHeaderSkeleton } from "@/components/skeletons";

/**
 * Fallback for the campaigns list.
 *
 * Shaped like `campaigns/page.tsx`: the solid reel-toned header, the network
 * filter chips, then campaign cards — each a titled block over a divided list
 * of tasks and a footer with the "Open reel" button.
 *
 * Two cards, not one: the page is nearly always taller than a single card, and
 * a fallback that is shorter than the page it replaces makes the scrollbar jump
 * when the real content lands.
 */
export default function CampaignsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <LoadingLabel />

      <PageHeaderSkeleton tone="reel" />

      {/* Network filter */}
      <div className="flex flex-wrap gap-2">
        {["w-16", "w-24", "w-24", "w-14", "w-20"].map((w, i) => (
          <Skeleton
            key={i}
            className={`h-8 shrink-0 rounded-full border border-gray-200 bg-white ${w}`}
          />
        ))}
      </div>

      {[0, 1].map((card) => (
        <div
          key={card}
          className="overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-sm"
        >
          {/* Card head: title, deadline, task counter */}
          <div className="flex items-start justify-between gap-4 p-6">
            <div className="min-w-0 flex-1 space-y-2.5">
              <Skeleton className="h-5 w-52 rounded-sm" />
              <Skeleton className="h-3.5 w-full max-w-sm rounded-sm" />
            </div>
            <Skeleton className="h-7 w-24 shrink-0 rounded-full" />
          </div>

          {/* Task rows */}
          <div className="px-6 pb-6">
            <div className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-4 p-4">
                  <Skeleton className="size-11 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40 rounded-sm" />
                    <Skeleton className="h-3 w-full max-w-xs rounded-sm" />
                  </div>
                  <Skeleton className="h-9 w-24 shrink-0 rounded-lg" />
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 bg-gray-50/50 px-6 py-4">
            <Skeleton className="h-3.5 w-full max-w-sm rounded-sm" />
            <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
