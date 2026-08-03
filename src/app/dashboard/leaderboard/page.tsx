import { Trophy } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { getLeaderboard } from "@/lib/queries";
import { cn, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Leaderboard" };

/**
 * Only the top three are marked, and only first place gets colour — indigo on
 * third place reads as the "you" highlight and makes the row ambiguous.
 */
const MEDALS = [
  "bg-warn-tint text-warn",
  "bg-canvas-sunk text-ink-soft",
  "bg-canvas-sunk text-ink-soft",
];

export default async function LeaderboardPage() {
  const rows = await getLeaderboard();

  return (
    <div className="space-y-4">
      <h1 className="text-[19px] font-semibold tracking-tight text-ink">
        Leaderboard
      </h1>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No rankings yet"
            description="Once ambassadors start earning points, the leaderboard fills up here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li
                key={row.ambassador_id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  row.is_me && "bg-brand-tint/45",
                )}
              >
                <span
                  className={cn(
                    "tabular grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-semibold",
                    MEDALS[row.position - 1] ?? "text-ink-faint",
                  )}
                >
                  {row.position}
                </span>

                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas-sunk text-[12.5px] font-semibold text-ink-soft"
                >
                  {initials(row.full_name)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">
                    {row.full_name}
                    {row.is_me && (
                      <span className="ml-1.5 text-[12px] font-normal text-brand">
                        you
                      </span>
                    )}
                  </p>
                  {row.college && (
                    <p className="truncate text-[12px] text-ink-soft">
                      {row.college}
                    </p>
                  )}
                </div>

                <span className="tabular shrink-0 text-[14px] font-semibold text-ink">
                  {formatNumber(row.points)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
