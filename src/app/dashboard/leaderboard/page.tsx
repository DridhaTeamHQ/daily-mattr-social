import { Star, Trophy } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { getCompletionLeaderboard } from "@/lib/queries";
import { cn, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Completion Leaderboard" };

const MEDAL_COLORS = ["bg-brand-strong text-white", "bg-black text-white", "bg-red-500 text-white"];
const AVATAR_COLORS = ["bg-brand-tint", "bg-gray-100", "bg-red-50"];
/**
 * How many rows to ask for.
 *
 * The whole batch, not a top ten: a board is scoped to the people who started
 * when you did, and a batch is small enough to read end to end. Cutting it at
 * ten left everybody below tenth looking at a list of nine strangers and their
 * own row pinned underneath, which says "you are not on this" rather than
 * "here is where you are". The function caps at 1000 either way.
 */
const LIMIT = 1000;

/** What an ambassador with no batch set sees under their name. */
const NO_BATCH = "No batch yet";

export default async function LeaderboardPage() {
  /**
   * One batch, always.
   *
   * `completion_leaderboard` decides who is on this board and migration 0049
   * makes that decision absolute: a student sees their own batch and nobody
   * else, and an ambassador whose batch has never been set is ranked against
   * the others who have none rather than against the whole programme. So the
   * page filters nothing and re-ranks nothing — every row it is handed
   * belongs here, already in order, already carrying the placing it earned
   * inside that batch.
   */
  const rows = await getCompletionLeaderboard(LIMIT);
  const me = rows.find((row) => row.is_me);

  /**
   * Whose board this is.
   *
   * Read off the viewer's own row rather than their profile, because it is
   * the same value the scoping used. Null when they have no batch, and the
   * heading then says nothing about batches rather than something untrue.
   */
  const batch = me?.batch?.trim() || null;

  /**
   * Has anybody scored yet?
   *
   * On the first days of a season nobody has, everyone sits on nought, and
   * `rank()` correctly gives all of them first place. Correct and unreadable:
   * a column of identical gold medals looks like a broken page, and it hands
   * out a placing nobody has earned. Until somebody is above zero the board
   * shows names without positions and says why underneath.
   */
  const scored = rows.some((row) => row.completion_pct > 0);

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={Trophy}
        tone="rank"
        title={batch ? `${batch} Leaderboard` : "Completion Leaderboard"}
        description={
          batch
            ? `This month's ranking within ${batch}, based on approved-task completion.`
            : "This month's ranking is based on approved-task completion."
        }
        variant="outline"
        className="bg-gray-50 border-gray-200"
        action={
          <div className="relative hidden size-16 shrink-0 items-end justify-center gap-1 overflow-hidden pt-4 md:flex md:h-20 md:w-32">
            <div className="absolute top-2 left-6 size-1.5 rotate-45 bg-brand" />
            <div className="absolute top-1 right-8 size-1 rounded-full bg-red-500" />
            <div className="absolute top-4 right-2 size-1.5 rotate-12 bg-black" />
            <div className="absolute top-5 left-2 size-1 rounded-full bg-brand/70" />
            <div className="flex h-8 w-6 items-center justify-center rounded-t-sm border border-gray-300 bg-gray-200 text-[10px] font-bold text-gray-700">2</div>
            <div className="relative flex h-12 w-8 items-center justify-center rounded-t-sm bg-brand-strong text-[12px] font-bold text-white shadow-sm">
              <Star className="absolute -top-5 size-4 fill-brand text-brand" />
              1
            </div>
            <div className="flex h-6 w-6 items-center justify-center rounded-t-sm border border-red-600 bg-red-500 text-[10px] font-bold text-white">3</div>
          </div>
        }
      />

      <p className="rounded-xl border border-brand/20 bg-brand-tint/50 px-4 py-3 text-[13px] font-semibold text-brand-press">
        Completion = approved tasks divided by total tasks assigned this month.
        {batch && ` Everyone in ${batch} is on this board — all ${rows.length} of them.`}
        {/* Their own placing, said once at the top. On a board of forty-one
            the row highlighted in brand blue is somewhere down the page, and
            a number here saves scrolling for it. Suppressed before anybody
            has scored, when there is no placing worth quoting. */}
        {scored && me && ` You're #${me.position}.`}
      </p>

      {/* ─── A board of four strangers needs explaining ──────────────────────
          Everyone is ranked inside their own batch, and somebody whose batch
          has never been set therefore lands with the other ambassadors who
          have none. That is the honest grouping — they were all set the same
          work — but without a word it reads as a broken board with most of
          the programme missing. So it says what happened and who can fix it,
          rather than leaving them to guess. */}
      {!batch && rows.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-900">
          Your batch hasn&apos;t been set yet, so you&apos;re ranked with the
          other ambassadors who are waiting on one. Ask an admin to add your
          batch and you&apos;ll move onto its board.
        </p>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No active tasks yet"
            description="The completion ranking will appear when this month's tasks are published."
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((row, index) => {
              const isTop3 = scored && row.position <= 3;
              const avatarBg = AVATAR_COLORS[index % AVATAR_COLORS.length];

              return (
                <li
                  key={row.ambassador_id}
                  className={cn(
                    "flex items-center gap-4 px-6 py-4",
                    row.is_me && "bg-brand-tint/50",
                  )}
                >
                  {isTop3 ? (
                    <div className="relative flex size-8 shrink-0 flex-col items-center justify-center">
                      <div className={cn("relative z-10 flex size-8 items-center justify-center rounded-full text-[13px] font-extrabold shadow-sm", MEDAL_COLORS[row.position - 1])}>
                        {row.position}
                      </div>
                      <div className={cn("absolute -bottom-1.5 h-3 w-5 opacity-80", MEDAL_COLORS[row.position - 1].split(" ")[0])} style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 70%, 0 100%)" }} />
                    </div>
                  ) : (
                    <div className="flex size-8 shrink-0 items-center justify-center text-[14px] font-bold text-ink-soft">
                      {scored ? row.position : "—"}
                    </div>
                  )}

                  <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold text-ink", avatarBg)}>
                    {initials(row.full_name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[14px] font-bold text-ink">
                      {row.full_name}
                      {row.is_me && <span className="rounded-full border border-brand/35 bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase text-brand-press">You</span>}
                    </p>
                    {/* The batch, on every row, the way it has always read.
                        The college used to sit here and says nothing about the
                        ranking; the batch is what the board is about.

                        Printed even when there isn't one, rather than leaving
                        the line blank: on a board where nobody has a batch,
                        an empty second line under every name looks like the
                        field failed to load, and this is the one board where
                        the missing batch is the reason these particular
                        people are grouped together. */}
                    <p
                      className={cn(
                        "truncate text-[12px] font-medium",
                        row.batch?.trim() ? "text-ink-soft" : "text-ink-faint",
                      )}
                    >
                      {row.batch?.trim() || NO_BATCH}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {/* A dash rather than "0%". The ranking still counts it as
                        zero — this only changes how it reads, because a column
                        of 0% down the bottom of a board is a list of people
                        being told off. */}
                    <span className={cn("tabular rounded-lg px-3 py-1.5 text-[14px] font-bold", row.is_me ? "bg-brand-tint text-brand-press" : "bg-gray-100 text-gray-900")}>
                      {row.completion_pct > 0
                        ? `${formatNumber(row.completion_pct)}%`
                        : "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Said once, under the board, rather than as a badge on every row.
          Nobody has completed anything yet, so there is nothing to rank and
          the positions are deliberately blank. */}
      {rows.length > 0 && !scored && (
        <p className="px-1 text-[12.5px] font-semibold text-ink-soft">
          Nobody has an approved task yet this month, so there are no placings
          to show. The first person to finish one takes the top spot.
        </p>
      )}
    </div>
  );
}
