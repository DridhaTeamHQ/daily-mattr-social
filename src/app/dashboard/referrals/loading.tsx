import { Skeleton } from "@/components/ui/feedback";
import { LoadingLabel } from "@/components/skeletons";

/**
 * Fallback for the referrals page.
 *
 * Shaped like `referrals/page.tsx`: the tinted banner, the big centred referral
 * code card, the QR and link card, the downloads tile, and the how-it-works
 * note. This page does not use `<PageHeader>` — its banner is its own shape,
 * so the skeleton is written out rather than borrowed.
 */
export default function ReferralsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <LoadingLabel />

      {/* Banner */}
      <div className="rounded-2xl border border-brand/20 bg-gradient-to-r from-brand-tint/90 via-brand-tint/40 to-white p-6 shadow-xs sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="size-12 shrink-0 rounded-xl bg-brand-strong/80 shadow-xs"
            />
            <div className="space-y-2">
              <Skeleton className="h-6 w-32 rounded-sm bg-white/70" />
              <Skeleton className="h-3.5 w-64 rounded-sm bg-white/70" />
            </div>
          </div>
          <Skeleton className="h-10 w-44 shrink-0 rounded-xl bg-white/70" />
        </div>
      </div>

      {/* Referral code */}
      <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xs sm:p-10">
        <div>
          <Skeleton className="mx-auto h-6 w-40 rounded-full" />
          <Skeleton className="mx-auto mt-5 h-[72px] w-full max-w-sm rounded-2xl sm:h-[84px]" />
        </div>
        <div className="flex justify-center pt-2">
          <Skeleton className="h-11 w-36 rounded-xl" />
        </div>
      </div>

      {/* The link row, in its locked shape — one line — because that is what
          `referral_link_unlock_at` is currently rendering. When that date
          passes the unlocked card is taller by the two button rows under the
          link; there is no QR square to leave room for while the app is
          Android-only. A skeleton that is the wrong height is a cosmetic flash
          on a slow load, not a bug, which is why this tracks the common case
          rather than reading the flag and delaying the fallback it exists to
          show immediately. */}
      <div className="flex items-center gap-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
        <Skeleton className="size-12 shrink-0 rounded-xl" />
        <div className="w-full space-y-2">
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-3.5 w-full max-w-md rounded-sm" />
        </div>
      </div>

      {/* Confirmed downloads */}
      <div className="flex items-center gap-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
        <Skeleton className="size-12 shrink-0 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-40 rounded-sm" />
          <Skeleton className="h-8 w-16 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
        </div>
      </div>

      {/* How referrals work */}
      <div className="flex items-start gap-3 rounded-2xl border border-brand/20 bg-brand-tint/60 p-5">
        <span
          aria-hidden
          className="mt-0.5 size-6 shrink-0 rounded-full bg-brand-strong/80"
        />
        <div className="w-full space-y-2">
          <Skeleton className="h-3.5 w-40 rounded-sm bg-brand/15" />
          <Skeleton className="h-3.5 w-full rounded-sm bg-brand/15" />
          <Skeleton className="h-3.5 w-3/4 rounded-sm bg-brand/15" />
        </div>
      </div>
    </div>
  );
}
