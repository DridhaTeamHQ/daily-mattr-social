import { Trophy } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SearchBox } from "@/components/search-box";
import { matches } from "@/lib/search";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { getLeaderboard } from "@/lib/queries";
import { cn, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Leaderboard" };

/**
 * Only the top three are marked, and only first place gets colour — indigo on
 * third place reads as the "you" highlight and makes the row ambiguous.
 */
const MEDALS = ["bg-brand", "bg-canvas-sunk", "bg-invite-tint"];

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
          <ul className="divide-y-[3px] divide-ink">
            {rows.map((row) => (
              <li
                key={row.ambassador_id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  row.is_me && "bg-rank",
                )}
              >
                <span
                  className={cn(
                    "tabular grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-ink",
                    MEDALS[row.position - 1]
                      ? cn("brut-sm", MEDALS[row.position - 1])
                      : "text-ink-faint",
                  )}
                >
                  {row.position}
                </span>

                <span
                  aria-hidden
                  className="brut-sm grid size-9 shrink-0 place-items-center rounded-full bg-surface text-[12.5px] font-extrabold text-ink"
                >
                  {initials(row.full_name)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-extrabold text-ink">
                    {row.full_name}
                    {row.is_me && (
                      <span className="brut-sm ml-2 rounded-full bg-surface px-2 py-0.5 text-[11px] font-extrabold">
                        YOU
                      </span>
                    )}
                  </p>
                  {row.college && (
                    <p className="truncate text-[12px] text-ink-soft">
                      {row.college}
                    </p>
                  )}
                </div>

                <span className="tabular display shrink-0 text-[17px] text-ink">
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
