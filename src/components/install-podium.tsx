import { Crown, Trophy } from "lucide-react";

import type { InstallPodiumRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Where the viewer themselves stands, for the rail beside the podium. */
export type InstallPodiumMe = {
  installs: number;
  /** Only ever set for the top few — see `getInstallBoard`. */
  rank: number | null;
};

/**
 * The three ambassadors bringing in the most installs, drawn as a podium, with
 * the viewer's own count standing beside it.
 *
 * A podium rather than three cards in a row, because the shape carries the
 * ranking on its own: the winner is taller and in the middle, and you read the
 * order before you read a single name. Three equal boxes need their numbers
 * read to mean anything.
 *
 * The blocks sit flush against each other and run into the bottom edge of the
 * card, so the card itself is the floor they stand on. Spaced apart and
 * floating above a gap they read as three unrelated bars, which is the shape
 * losing the one thing it was drawn for.
 *
 * ─── Why it is dressed up ───────────────────────────────────────────────────
 *
 * Being top three is the reward — there is nothing else attached to it — so
 * the drawing has to do the work a prize would. Hence the warm stage light
 * behind first place, the crown, the confetti, the blocks pushing up out of
 * the floor on load and the gleam that crosses the gold one. Every bit of it
 * is CSS on plain divs: no JavaScript ships, and `prefers-reduced-motion`
 * kills the loops globally in `globals.css`.
 *
 * ─── The rail ───────────────────────────────────────────────────────────────
 *
 * A podium nobody is on is someone else's trophy cabinet. The rail down the
 * side answers "and me?" in the same glance — the viewer's own count, their
 * placing, and a line written for the place they are actually standing in.
 *
 * Three counts, not three names: everybody level on seven installs shares a
 * place, so one of them stands on the block — which leaves the third block for
 * the third best count rather than spending the whole podium on one number.
 * See `getInstallBoard`.
 *
 * Three, not ten: the full board already exists at /dashboard/leaderboard and
 * ranks by task completion. This is the other thing the programme is actually
 * asking for, sat on the dashboard where it is seen without being navigated to.
 *
 * Shown to everyone, with the viewer's own column named "You". A board only
 * its winners can see cannot make anybody climb, and the three on it get more
 * out of being named on forty-eight dashboards than on three.
 *
 * First names only, and nothing about anyone outside the three — see
 * `getInstallBoard`, which is where that boundary is drawn.
 */
export function InstallPodium({
  rows,
  me,
}: {
  rows: InstallPodiumRow[];
  me: InstallPodiumMe;
}) {
  // Nothing to celebrate until somebody has referred an install. An empty
  // podium is three grey blocks asking to be filled, which is a worse look
  // than no section at all.
  if (rows.length === 0) return null;

  const placed = rows.map((row, i) => ({ row, rank: i + 1 }));

  // Confetti is thrown for the viewer, not for the board. On somebody else's
  // third place it is decoration on a card about other people; on your own it
  // is the reward, so it falls only when the person reading is one of the
  // three counts standing on it.
  const mine = me.rank !== null && me.rank <= INSTALL_PODIUM_PLACES;

  /**
   * Second, first, third — the order they stand in, not the order they placed.
   *
   * Filtered rather than assumed: on a young programme only one or two people
   * may have referred anything, and a podium with holes in it would render as
   * a gap where a person should be.
   */
  const standing = [placed[1], placed[0], placed[2]].filter(Boolean);

  return (
    <section>
      <div className="flex items-center gap-2">
        <Trophy className="size-4 text-amber-500" aria-hidden />
        <h2 className="text-[13px] font-extrabold tracking-wide text-ink uppercase">
          Top referrers
        </h2>
      </div>
      <p className="mt-1 text-[12.5px] font-medium text-gray-500">
        Most app installs brought in so far.
      </p>

      {/* No bottom padding on the podium column: the blocks are meant to reach
          the card's edge and stand on it. `overflow-hidden` keeps their corners
          — and the confetti — inside the radius. */}
      <div className="relative mt-3 overflow-hidden rounded-2xl border border-amber-100/80 bg-gradient-to-b from-amber-50/70 via-white to-gray-50 shadow-sm">
        {mine ? <Confetti /> : null}

        <div className="relative flex flex-col sm:flex-row sm:items-stretch">
          {/* ─── The podium ─────────────────────────────────────────────── */}
          {/* Capped and centred, because across the full dashboard width three
              columns strand the shape in the middle of an empty card. Wide
              enough that a full name gets a line to itself at this size —
              names are the point of the board, so the shape gives way to them
              rather than the other way round. */}
          {/* The padding and the gap are cut right back on a phone, where the
              three columns are dividing 343px between them and every pixel
              taken by the frame comes straight out of a name. */}
          <ol className="mx-auto flex w-full max-w-[540px] items-end justify-center gap-1.5 px-2 pt-7 sm:gap-2 sm:px-6">
            {standing.map(({ row, rank }, i) => (
              <li
                key={`${rank}-${row.name}`}
                className="relative flex min-w-0 flex-1 flex-col items-center"
              >
                {/* The stage light. Sits behind first place only, and only
                    reaches as far as the block — it is meant to look like the
                    winner is lit, not like the card has a stain. */}
                {rank === 1 ? (
                  <span
                    className="pointer-events-none absolute -inset-x-4 bottom-0 top-0 -z-10 bg-[radial-gradient(ellipse_at_50%_85%,rgba(251,191,36,0.28),transparent_70%)]"
                    aria-hidden
                  />
                ) : null}

                {/* ─── Who ───────────────────────────────────────────────── */}
                {rank === 1 ? (
                  <Crown
                    className="animate-float size-5 fill-amber-300 text-amber-500 drop-shadow-sm"
                    aria-hidden
                  />
                ) : (
                  <span className="block h-5" aria-hidden />
                )}

                <span
                  className={cn(
                    "animate-pop mt-0.5 grid size-11 place-items-center rounded-full text-[15px] font-extrabold shadow-sm sm:size-12",
                    MEDAL[rank]?.avatar,
                  )}
                  style={{ animationDelay: `${POP_DELAY[rank]}ms` }}
                >
                  {row.name.charAt(0).toUpperCase()}
                </span>

                {/* Wraps rather than truncates. A name cut off mid-word is
                    the one failure this section cannot afford — the whole
                    reward is seeing your name on it — so a long one takes a
                    second line and the column grows upward. The blocks are
                    bottom-aligned, so that costs the podium nothing: they all
                    stay on the same floor however tall the names above go.

                    A size smaller on a phone, where three columns have to
                    share 375px: at 13px a name like "Venkataraghavan" is wider
                    than its column and `break-words` snaps it mid-syllable,
                    which is the mangling this was meant to avoid. */}
                <p
                  className={cn(
                    "mt-2 w-full break-words text-center text-[11.5px] font-extrabold leading-tight sm:text-[13px]",
                    // The page's blue, the same one the nav pill and the tile
                    // labels take, so "You" is recognisably the same accent
                    // rather than a second, darker blue nothing else uses.
                    row.isMe ? "text-brand" : "text-ink",
                  )}
                  title={row.isMe ? "You" : row.name}
                >
                  {row.isMe ? "You" : row.name}
                </p>
                <p className="mt-0.5 text-[10.5px] font-semibold text-gray-500 sm:text-[11.5px]">
                  {row.installs} {row.installs === 1 ? "install" : "installs"}
                </p>

                {/* ─── The block they stand on ───────────────────────────── */}
                <div
                  className={cn(
                    "podium-grow relative mt-2 flex w-full items-start justify-center overflow-hidden rounded-t-lg pt-2",
                    MEDAL[rank]?.block,
                    BLOCK_HEIGHT[rank],
                    // Nothing marks the viewer's own block. The name above it
                    // already says "You" in the brand blue, and a blue
                    // outline on a gold or copper block was a fourth colour
                    // fighting the three the podium is made of.
                  )}
                  // Third up first, the winner last, so the eye ends where the
                  // ranking does.
                  style={{ animationDelay: `${GROW_DELAY[rank]}ms` }}
                >
                  {/* Pinned to the top of the block so the numerals line up
                      across three different heights. */}
                  <span className="text-[20px] font-black text-white/95 sm:text-[24px]">
                    {rank}
                  </span>

                  {/* The light only ever falls on the blocks. One band per
                      block rather than one across the card, offset by the
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

          {/* ─── And you ────────────────────────────────────────────────── */}
          <YouRail me={me} />
        </div>
      </div>
    </section>
  );
}

/**
 * The viewer's own install count, beside the podium rather than under it.
 *
 * Divided off with a rule rather than a card of its own: it is the same board
 * read from the viewer's seat, not a second statistic. It stacks below the
 * podium on a phone, where there is no side to put it on.
 */
function YouRail({ me }: { me: InstallPodiumMe }) {
  const { tone, line } = railMessage(me.rank);

  return (
    <div className="flex shrink-0 flex-col justify-center gap-1 border-t border-gray-100 px-4 py-4 sm:w-[188px] sm:border-l sm:border-t-0 sm:px-5 sm:py-6">
      <p className="text-[10.5px] font-extrabold uppercase tracking-widest text-amber-600">
        Your installs
      </p>

      <div className="flex items-baseline gap-2">
        <span className="text-[30px] font-black leading-none text-ink">{me.installs}</span>
        {me.rank ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">
            #{me.rank}
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "text-[12px] font-semibold leading-snug",
          tone === "gold" ? "text-amber-700" : "text-gray-500",
        )}
      >
        {line}
      </p>
    </div>
  );
}

/**
 * What the rail says, for the place the viewer is actually in.
 *
 * Five situations, five lines, and every one of them ends on the move rather
 * than the standing: a rail that says "you are third" and stops has told
 * somebody something the podium beside it already said.
 *
 * The placing is the dense one from `getInstallBoard` — a count, not a row —
 * so everybody level on seven installs reads the same line. Null is eleventh
 * or below, the one band the board does not put a number on.
 */
function railMessage(rank: number | null): { tone: "gold" | "plain"; line: string } {
  if (rank === 1) {
    return {
      tone: "plain",
      line: "You’re on top!! Keep referring. Don’t let anyone steal the crown.. PROTECT IT!",
    };
  }

  if (rank === 2) {
    return { tone: "plain", line: "So close! First place is right there.. GO TAKE IT!" };
  }

  if (rank === 3) {
    return { tone: "plain", line: "You made the podium!! Now make it to FIRST!!" };
  }

  if (rank !== null) {
    return {
      tone: "plain",
      line: "The podium is calling.. A few more referrals and YOU'RE IN!",
    };
  }

  return {
    tone: "plain",
    line: "Not on the podium yet? Time to make your move.. NOW!",
  };
}

/**
 * A handful of paper scraps across the top of the card.
 *
 * Only for the three counts on the board, and only on their own dashboard —
 * see `mine` above.
 *
 * Fixed positions rather than random ones: this renders on the server, and
 * anything random here would differ between the server and client HTML.
 */
function Confetti() {
  return (
    <span className="pointer-events-none absolute inset-x-0 top-0 h-24 overflow-hidden" aria-hidden>
      {CONFETTI.map((bit, i) => (
        <span
          key={i}
          className={cn("absolute block rounded-[1px]", bit.className)}
          style={{ left: bit.left, top: bit.top, transform: `rotate(${bit.rotate}deg)` }}
        />
      ))}
    </span>
  );
}

/** Places the podium has, and so the placings the confetti falls for. */
const INSTALL_PODIUM_PLACES = 3;

const CONFETTI = [
  { left: "6%", top: "18px", rotate: 24, className: "h-2 w-1 bg-amber-300/70" },
  { left: "14%", top: "44px", rotate: -14, className: "h-1.5 w-1.5 bg-brand-strong/25" },
  { left: "27%", top: "10px", rotate: 40, className: "h-2.5 w-1 bg-orange-300/60" },
  { left: "41%", top: "34px", rotate: -30, className: "h-1 w-2 bg-amber-400/50" },
  { left: "58%", top: "14px", rotate: 12, className: "h-2 w-1 bg-emerald-300/50" },
  { left: "69%", top: "48px", rotate: -22, className: "h-1.5 w-1.5 bg-amber-300/60" },
  { left: "82%", top: "22px", rotate: 34, className: "h-2.5 w-1 bg-brand-strong/20" },
  { left: "92%", top: "52px", rotate: -8, className: "h-1 w-2 bg-orange-300/55" },
];

/**
 * Gold, silver, bronze — the one place in the app that reads as a medal.
 *
 * Third place is a muted copper rather than the bright orange it started as.
 * Orange-400 next to amber-400 is the louder colour of the two, so the eye
 * landed on the bronze block first and the podium ranked itself backwards.
 * Bronze is a dull brown metal; letting it look like one puts gold back on top
 * without having to make gold shout.
 */
const MEDAL: Record<number, { avatar: string; block: string }> = {
  1: {
    avatar: "bg-amber-400 text-amber-950 ring-2 ring-amber-300",
    block: "bg-gradient-to-b from-amber-400 to-amber-500",
  },
  2: {
    avatar: "bg-gray-300 text-gray-800 ring-2 ring-gray-200",
    block: "bg-gradient-to-b from-gray-300 to-gray-400",
  },
  3: {
    avatar: "bg-[#dcb193] text-[#5c3517] ring-2 ring-[#ecd4c1]",
    block: "bg-gradient-to-b from-[#cd9c78] to-[#b9855e]",
  },
};

/** The whole point of the shape: first stands highest. */
const BLOCK_HEIGHT: Record<number, string> = {
  1: "h-20 sm:h-24",
  2: "h-14 sm:h-16",
  3: "h-10 sm:h-12",
};

/** Blocks rise third, second, first; the faces land just behind each block. */
const GROW_DELAY: Record<number, number> = { 1: 320, 2: 160, 3: 0 };
const POP_DELAY: Record<number, number> = { 1: 520, 2: 360, 3: 200 };
