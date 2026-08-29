import { Coin } from "@/components/milestone-runner";
import type { InstallPodiumRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Where the viewer themselves stands, for the coin counter above the podium. */
export type InstallPodiumMe = {
  installs: number;
  /** Only ever set for the top few — see `getInstallBoard`. */
  rank: number | null;
};

/**
 * The three ambassadors bringing in the most installs, standing on a podium
 * built out of the same blocks as the level they are standing in.
 *
 * A podium rather than three cards in a row, because the shape carries the
 * ranking on its own: the winner is taller and in the middle, and you read the
 * order before you read a single name. Three equal boxes need their numbers
 * read to mean anything.
 *
 * ─── Why it lives inside the level ──────────────────────────────────────────
 *
 * It used to be its own card, in its own idiom — a cream card with confetti,
 * sat directly under a pixel-art one. Two celebrations in two visual languages
 * stacked on top of each other, and neither of them the thing the eye went to.
 * They are the same idea anyway: here is how far along you are, and here is
 * who is ahead. So the podium moved into the level, got built out of blocks,
 * and the scene now says both at once.
 *
 * The columns stand on their own brick ledge rather than on the track below.
 * The runner is on that track and moves with the viewer's completion, so
 * anything else standing on it would sooner or later be stood inside — a
 * floating platform is both the fix and the more Mario answer.
 *
 * ─── The coin counter ───────────────────────────────────────────────────────
 *
 * A podium nobody is on is someone else's trophy cabinet, so the viewer's own
 * installs go above it, counted in coins the way the HUD counts everything
 * else. The gap to the podium comes from the third-place count already printed
 * on it, so it leaks nothing new.
 *
 * Three, not ten: the full board already exists at /dashboard/leaderboard and
 * ranks by task completion. This is the other thing the programme is actually
 * asking for, sat on the dashboard where it is seen without being navigated to.
 *
 * Shown to everyone, with the viewer's own column named "You". A board only
 * its winners can see cannot make anybody climb, and the three on it get more
 * out of being named on forty-eight dashboards than on three.
 *
 * Nothing about anyone outside the three — see `getInstallBoard`, which is
 * where that boundary is drawn.
 */
export function InstallPodiumScene({
  rows,
  me,
}: {
  rows: InstallPodiumRow[];
  me: InstallPodiumMe;
}) {
  // Nothing to celebrate until somebody has referred an install. An empty
  // podium is three grey blocks asking to be filled, which is a worse look
  // than no section at all — and here it would also be three blocks of dead
  // scenery in the middle of the level.
  if (rows.length === 0) return null;

  const placed = rows.map((row, i) => ({ row, rank: i + 1 }));

  /**
   * Second, first, third — the order they stand in, not the order they placed.
   *
   * Filtered rather than assumed: on a young programme only one or two people
   * may have referred anything, and a podium with holes in it would render as
   * a gap where a person should be.
   */
  const standing = [placed[1], placed[0], placed[2]].filter(Boolean);

  const onPodium = placed.some(({ row }) => row.isMe);

  // The bar to clear is the lowest count actually standing — third on a full
  // podium, second or first while it is still filling up. One more than that
  // is what it takes to get on, ties going to whoever was there first.
  const lowest = placed[placed.length - 1]?.row.installs ?? 0;
  const toGo = lowest + 1 - me.installs;

  return (
    <section className="relative mt-3" aria-label="Top referrers">
      {/* ─── The HUD line ──────────────────────────────────────────────────
          The viewer's own installs, counted the way a HUD counts things. */}
      <div className="mario-hud flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] sm:text-[12px]">
        <span className="tracking-[0.16em] uppercase">Top referrers</span>
        {/* The coin and the count are one flex item, so a narrow screen wraps
            the sentence after them rather than between them. */}
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Coin className="shrink-0" />
          <strong className="font-black">&times; {me.installs}</strong>
        </span>
        <span className="opacity-85">
          {onPodium
            ? "you're on the podium"
            : me.installs === 0
              ? "share your link to get on the board"
              : toGo > 0
                ? `${toGo} more to reach the podium`
                : "right on the edge of the podium"}
        </span>
      </div>

      {/* ─── The platform ──────────────────────────────────────────────────
          Blocks and ledge share one wrapper so their edges line up. */}
      <div className="mx-auto mt-1.5 w-full max-w-[420px]">
        <ol className="flex items-end justify-center">
          {standing.map(({ row, rank }, i) => (
            <li key={`${rank}-${row.name}`} className="flex min-w-0 flex-1 flex-col items-center">
              {/* ─── Who ─────────────────────────────────────────────────── */}
              {rank === 1 ? (
                <PixelCrown className="block-bob" />
              ) : (
                <span className="block h-[15px]" aria-hidden />
              )}

              {/* Name and count on one line rather than two. The card is a
                  scene sitting above the fold on every dashboard, so every row
                  of text here costs the level height it cannot spare — and
                  "installs" is a word the HUD above has already said.

                  The viewer's own name is coin yellow, set inline because
                  `.mario-hud` sets a colour of its own at the same specificity
                  as a utility class, and which of the two wins is then down to
                  source order rather than intent. */}
              <p
                className="mario-hud mt-0.5 w-full px-0.5 text-center text-[10.5px] leading-tight break-words sm:text-[11.5px]"
                style={row.isMe ? { color: "#ffe27a" } : undefined}
                title={`${row.isMe ? "You" : row.name} — ${row.installs} installs`}
              >
                {row.isMe ? "You" : row.name}{" "}
                <span className="font-black whitespace-nowrap opacity-85">
                  &middot; {row.installs}
                </span>
              </p>

              {/* ─── The block they stand on ───────────────────────────────
                  No bottom border: the ledge underneath is the bottom edge,
                  and two 3px lines meeting there would draw a seam across a
                  podium that is meant to be one solid piece. */}
              <div
                className={cn(
                  "podium-grow pixel-face relative mt-1 flex w-full items-start justify-center overflow-hidden border-[3px] border-b-0 border-ink pt-0.5",
                  BLOCK_HEIGHT[rank],
                  MEDAL[rank],
                )}
                // Third up first, the winner last, so the eye ends where the
                // ranking does.
                style={{ animationDelay: `${GROW_DELAY[rank]}ms` }}
              >
                {/* Pinned to the top of the block so the numerals line up
                    across three different heights. */}
                <span className="text-[15px] font-black text-ink sm:text-[18px]">{rank}</span>

                {/* The light only ever falls on the blocks, offset by the
                    column's position on the floor — left, middle, right — so
                    the three of them read as a single sweep crossing the
                    podium instead of three lamps blinking together. */}
                <span
                  className="podium-gleam pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/55 to-transparent"
                  style={{ animationDelay: `${i * 500}ms` }}
                  aria-hidden
                />
              </div>
            </li>
          ))}
        </ol>

        {/* The ground the podium stands on. Floating, like the brick runs the
            game hangs in mid-air, so the track below stays clear for the
            runner. */}
        <div className="pixel-ledge h-[9px] w-full border-[3px] border-ink" aria-hidden />
      </div>
    </section>
  );
}

/** A crown on the same 3px grid as the rest of the scene. */
function PixelCrown({ className }: { className?: string }) {
  return (
    <svg
      width="24"
      height="15"
      viewBox="0 0 24 15"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <g fill="#0a0a0a">
        <rect x="0" y="0" width="3" height="15" />
        <rect x="21" y="0" width="3" height="15" />
        <rect x="9" y="0" width="6" height="3" />
        <rect x="0" y="12" width="24" height="3" />
      </g>
      <g fill="#fbd000">
        <rect x="3" y="3" width="3" height="9" />
        <rect x="18" y="3" width="3" height="9" />
        <rect x="9" y="3" width="6" height="9" />
        <rect x="6" y="9" width="12" height="3" />
      </g>
      <g fill="#e39b1f">
        <rect x="6" y="6" width="3" height="3" />
        <rect x="15" y="6" width="3" height="3" />
      </g>
    </svg>
  );
}

/**
 * Gold, silver, bronze — the one place in the app that reads as a medal.
 *
 * Third place is a muted copper rather than the bright orange it started as.
 * Orange next to gold is the louder colour of the two, so the eye landed on
 * the bronze block first and the podium ranked itself backwards. Bronze is a
 * dull brown metal; letting it look like one puts gold back on top without
 * having to make gold shout.
 */
const MEDAL: Record<number, string> = {
  1: "bg-[#fbd000]",
  2: "bg-[#cdd3da]",
  3: "bg-[#c98a5e]",
};

/** The whole point of the shape: first stands highest. */
const BLOCK_HEIGHT: Record<number, string> = {
  1: "h-[52px] sm:h-[62px]",
  2: "h-[38px] sm:h-[45px]",
  3: "h-[28px] sm:h-[33px]",
};

/** Blocks rise third, second, first. */
const GROW_DELAY: Record<number, number> = { 1: 320, 2: 160, 3: 0 };
