import { Trophy, Star } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SearchBox } from "@/components/search-box";
import { matches } from "@/lib/search";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { getLeaderboard } from "@/lib/queries";
import { cn, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Leaderboard" };

const MEDAL_COLORS = ["bg-blue-600 text-white", "bg-black text-white", "bg-red-500 text-white"];
const AVATAR_COLORS = [
  "bg-blue-50",
  "bg-gray-100",
  "bg-red-50",
];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, all] = await Promise.all([searchParams, getLeaderboard()]);
  const query = q ?? "";
  const rows = all.filter((r) => matches(query, r.full_name, r.college));

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={Trophy}
        tone="rank"
        title="Leaderboard"
        description="Every active ambassador, ranked by points earned."
        variant="outline"
        className="bg-gray-50 border-gray-200"
        action={
          <div className="relative size-16 shrink-0 md:w-32 md:h-20 hidden sm:flex items-end justify-center gap-1 overflow-hidden pt-4">
            {/* Confetti / Stars */}
            <div className="absolute top-2 left-6 size-1.5 bg-blue-500 rotate-45" />
            <div className="absolute top-1 right-8 size-1 bg-red-500 rounded-full" />
            <div className="absolute top-4 right-2 size-1.5 bg-black rotate-12" />
            <div className="absolute top-5 left-2 size-1 bg-blue-400 rounded-full" />
            
            {/* Rank 2 */}
            <div className="w-6 h-8 bg-gray-200 border border-gray-300 rounded-t-sm flex items-center justify-center font-bold text-gray-700 text-[10px]">2</div>
            {/* Rank 1 */}
            <div className="w-8 h-12 bg-blue-600 rounded-t-sm flex items-center justify-center font-bold text-white text-[12px] relative shadow-sm">
              <div className="absolute -top-5 text-blue-500"><Star className="fill-blue-500 size-4" /></div>
              1
            </div>
            {/* Rank 3 */}
            <div className="w-6 h-6 bg-red-500 border border-red-600 rounded-t-sm flex items-center justify-center font-bold text-white text-[10px]">3</div>
          </div>
        }
      />

      <SearchBox placeholder="Find someone by name or college…" />

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={query ? "Nobody matches that" : "No rankings yet"}
            description={
              query
                ? "Try a different name or college."
                : "Once ambassadors start earning points, the leaderboard fills up here."
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((row, index) => {
              const isTop3 = row.position <= 3;
              const avatarBg = AVATAR_COLORS[index % AVATAR_COLORS.length];

              return (
                <li
                  key={row.ambassador_id}
                  className={cn(
                    "flex items-center gap-4 px-6 py-4",
                    row.is_me && "bg-blue-50/50",
                  )}
                >
                  {isTop3 ? (
                    <div className="relative flex size-8 shrink-0 flex-col items-center justify-center">
                      <div className={cn("relative z-10 flex size-8 items-center justify-center rounded-full text-[13px] font-extrabold shadow-sm", MEDAL_COLORS[row.position - 1])}>
                        {row.position}
                      </div>
                      <div className={cn("absolute -bottom-1.5 h-3 w-5 opacity-80", MEDAL_COLORS[row.position - 1].split(' ')[0])} style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 70%, 0 100%)' }} />
                    </div>
                  ) : (
                    <div className="flex size-8 shrink-0 items-center justify-center text-[14px] font-bold text-ink-soft">
                      {row.position}
                    </div>
                  )}

                  <span
                    aria-hidden
                    className={cn("grid size-10 shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold text-ink", avatarBg)}
                  >
                    {initials(row.full_name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-ink flex items-center gap-2">
                      {row.full_name}
                      {row.is_me && (
                        <span className="rounded-full bg-blue-100 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-800 uppercase">
                          You
                        </span>
                      )}
                    </p>
                    {row.college && (
                      <p className="truncate text-[12px] text-ink-soft font-medium">
                        {row.college}
                      </p>
                    )}
                  </div>

                  <span className={cn("tabular shrink-0 px-3 py-1.5 rounded-lg font-bold text-[14px]", row.is_me ? "bg-blue-100 text-blue-900" : "bg-gray-100 text-gray-900")}>
                    {formatNumber(row.points)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
