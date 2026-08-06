import { Trophy, Star } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { FilterChips, type ChipOption } from "@/components/filter-chips";
import {
  getLeaderboardWindow,
  isLeaderSource,
  isLeaderWindow,
  LEADER_SOURCES,
  LEADER_WINDOWS,
  type LeaderSource,
  type LeaderWindow,
} from "@/lib/queries";
import { cn, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Leaderboard" };

const MEDAL_COLORS = ["bg-brand-strong text-white", "bg-black text-white", "bg-red-500 text-white"];
const AVATAR_COLORS = [
  "bg-brand-tint",
  "bg-gray-100",
  "bg-red-50",
];

/** Top N shown by default. The spec asks for 10-20; 20 keeps a big cohort interesting. */
const VISIBLE = 20;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; source?: string }>;
}) {
  const params = await searchParams;

  const window: LeaderWindow = isLeaderWindow(params.window) ? params.window : "all";
  const source: LeaderSource | null = isLeaderSource(params.source)
    ? params.source
    : null;

  const matched = await getLeaderboardWindow({ window, source });

  // Top N, plus the viewer's own row appended when they fall outside it. Being
  // ranked 47th and seeing nothing about yourself is the one thing a
  // leaderboard must not do — the rank you are chasing is your own.
  const visible = matched.slice(0, VISIBLE);
  const me = matched.find((r) => r.is_me);
  const rows = me && !visible.some((r) => r.is_me) ? [...visible, me] : visible;
  const meIsPinned = Boolean(me) && !visible.some((r) => r.is_me);

  const href = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    const merged = { window, source, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === "window" && value === "all")) sp.set(key, value);
    }
    const qs = sp.toString();
    return qs ? `/dashboard/leaderboard?${qs}` : "/dashboard/leaderboard";
  };

  const windowChips: ChipOption[] = LEADER_WINDOWS.map((w) => ({
    key: w.key,
    label: w.label,
    href: href({ window: w.key }),
  }));

  const sourceChips: ChipOption[] = [
    { key: "", label: "All points", href: href({ source: null }) },
    ...LEADER_SOURCES.filter((s) => !s.hidden).map((s) => ({
      key: s.key,
      label: s.label,
      href: href({ source: s.key }),
    })),
  ];

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={Trophy}
        tone="rank"
        title="Leaderboard"
        description="The race is on. Earn more points and claim your spot!"
        variant="outline"
        className="bg-gray-50 border-gray-200"
        action={
          <div className="relative size-16 shrink-0 md:w-32 md:h-20 hidden sm:flex items-end justify-center gap-1 overflow-hidden pt-4">
            {/* Confetti / Stars */}
            <div className="absolute top-2 left-6 size-1.5 bg-brand rotate-45" />
            <div className="absolute top-1 right-8 size-1 bg-red-500 rounded-full" />
            <div className="absolute top-4 right-2 size-1.5 bg-black rotate-12" />
            <div className="absolute top-5 left-2 size-1 bg-brand/70 rounded-full" />
            
            {/* Rank 2 */}
            <div className="w-6 h-8 bg-gray-200 border border-gray-300 rounded-t-sm flex items-center justify-center font-bold text-gray-700 text-[10px]">2</div>
            {/* Rank 1 */}
            <div className="w-8 h-12 bg-brand-strong rounded-t-sm flex items-center justify-center font-bold text-white text-[12px] relative shadow-sm">
              <div className="absolute -top-5 text-brand"><Star className="fill-brand size-4" /></div>
              1
            </div>
            {/* Rank 3 */}
            <div className="w-6 h-6 bg-red-500 border border-red-600 rounded-t-sm flex items-center justify-center font-bold text-white text-[10px]">3</div>
          </div>
        }
      />

      {/* What the points are for on the left, what period they cover on the
          right — the two halves of the same question, read left to right. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <FilterChips label="Points" options={sourceChips} active={source ?? ""} />
        <FilterChips label="When" options={windowChips} active={window} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No rankings yet"
            description="Once ambassadors start earning points, the leaderboard fills up here."
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
                    row.is_me && "bg-brand-tint/50",
                    // A pinned row is not rank 21, and a plain divider would
                    // read as though it were.
                    meIsPinned && index === rows.length - 1 &&
                      "border-t-[3px] border-dashed border-brand/50",
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
                        <span className="rounded-full bg-brand-tint border border-brand/35 px-2 py-0.5 text-[10px] font-bold text-brand-press uppercase">
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

                  <span className={cn("tabular shrink-0 px-3 py-1.5 rounded-lg font-bold text-[14px]", row.is_me ? "bg-brand-tint text-brand-press" : "bg-gray-100 text-gray-900")}>
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
