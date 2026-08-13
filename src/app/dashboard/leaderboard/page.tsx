import { Star, Trophy } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { getCompletionLeaderboard } from "@/lib/queries";
import { cn, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Completion Leaderboard" };

const MEDAL_COLORS = ["bg-brand-strong text-white", "bg-black text-white", "bg-red-500 text-white"];
const AVATAR_COLORS = ["bg-brand-tint", "bg-gray-100", "bg-red-50"];
const VISIBLE = 20;

export default async function LeaderboardPage() {
  const matched = await getCompletionLeaderboard();
  const visible = matched.slice(0, VISIBLE);
  const me = matched.find((row) => row.is_me);
  const rows = me && !visible.some((row) => row.is_me) ? [...visible, me] : visible;
  const meIsPinned = Boolean(me) && !visible.some((row) => row.is_me);

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={Trophy}
        tone="rank"
        title="Completion Leaderboard"
        description="This month's ranking is based on approved-task completion."
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
      </p>

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
              const isTop3 = row.position <= 3;
              const avatarBg = AVATAR_COLORS[index % AVATAR_COLORS.length];

              return (
                <li
                  key={row.ambassador_id}
                  className={cn(
                    "flex items-center gap-4 px-6 py-4",
                    row.is_me && "bg-brand-tint/50",
                    meIsPinned && index === rows.length - 1 && "border-t-[3px] border-dashed border-brand/50",
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
                    <div className="flex size-8 shrink-0 items-center justify-center text-[14px] font-bold text-ink-soft">{row.position}</div>
                  )}

                  <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold text-ink", avatarBg)}>
                    {initials(row.full_name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[14px] font-bold text-ink">
                      {row.full_name}
                      {row.is_me && <span className="rounded-full border border-brand/35 bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase text-brand-press">You</span>}
                    </p>
                    {row.college && <p className="truncate text-[12px] font-medium text-ink-soft">{row.college}</p>}
                  </div>

                  <div className="shrink-0 text-right">
                    <span className={cn("tabular rounded-lg px-3 py-1.5 text-[14px] font-bold", row.is_me ? "bg-brand-tint text-brand-press" : "bg-gray-100 text-gray-900")}>
                      {formatNumber(row.completion_pct)}%
                    </span>
                    <p className="mt-1 text-[11px] font-semibold text-ink-soft">
                      {formatNumber(row.approved_tasks)}/{formatNumber(row.total_tasks)} approved
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
