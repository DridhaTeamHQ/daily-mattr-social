/**
 * Route-level fallback for the ambassador screens.
 *
 * Without this, Next holds the old page on screen until the server responds,
 * so a nav tap looks like nothing happened — which is exactly what "clicking
 * and it responds late" feels like. With it, the shell swaps instantly and the
 * data fills in behind.
 *
 * Deliberately shaped like the dashboard it replaces (hero block, chip row,
 * three tiles, two cards) so the layout doesn't jump when the real content
 * lands.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-7" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Hero */}
      <div className="brut-lg animate-sheen h-52 rounded-lg bg-brand sm:h-60" />

      {/* Tier chips */}
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="animate-sheen h-9 w-32 shrink-0 rounded-full border-[3px] border-ink bg-surface"
          />
        ))}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="brut animate-sheen h-28 rounded-md bg-reel-tint" />
        <div className="brut animate-sheen h-28 rounded-md bg-poll-tint" />
        <div className="brut animate-sheen col-span-2 h-28 rounded-md bg-invite-tint sm:col-span-1" />
      </div>

      {/* Content cards */}
      <div className="space-y-3">
        <div className="brut-sm h-7 w-32 rounded-sm bg-brand" />
        <div className="brut animate-sheen h-36 rounded-md bg-surface" />
        <div className="brut animate-sheen h-36 rounded-md bg-surface" />
      </div>
    </div>
  );
}
