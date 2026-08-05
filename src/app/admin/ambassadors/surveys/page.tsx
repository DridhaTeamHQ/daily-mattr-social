import Link from "next/link";
import { ClipboardList, Flag, Pointer } from "lucide-react";

import { AmbassadorNav } from "@/components/ambassador-nav";
import { SearchBox } from "@/components/search-box";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { getSurveyParticipation } from "@/lib/admin/participation";
import { requireAdmin } from "@/lib/admin/queries";
import { matches } from "@/lib/search";
import { formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Ambassadors · Surveys" };

/**
 * Survey performance per ambassador.
 *
 * Clicks and responses side by side, because they separate two very different
 * problems: nobody clicking means the link is not being shared, and plenty of
 * clicks with no responses means the survey itself is losing people.
 */
export default async function AmbassadorSurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();

  const [{ q }, rows] = await Promise.all([
    searchParams,
    getSurveyParticipation(),
  ]);

  const query = q ?? "";
  const list = rows.filter((r) => matches(query, r.name, r.city, r.batch));

  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalResponses = rows.reduce((s, r) => s + r.responses, 0);
  const collecting = rows.filter((r) => r.responses > 0).length;

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Survey performance
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Who is sharing their links, and whose links actually convert.
          </p>
        </div>
        <AmbassadorNav />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Collecting"
          value={`${collecting}/${rows.length}`}
          sub="With at least one response"
          icon={ClipboardList}
          tone="poll"
        />
        <Stat
          label="Link clicks"
          value={formatNumber(totalClicks)}
          sub="Across every survey link"
          icon={Pointer}
          tone="brand"
        />
        <Stat
          label="Responses"
          value={formatNumber(totalResponses)}
          sub="Counted as valid"
          icon={ClipboardList}
          tone="rank"
        />
        <Stat
          label="Click to response"
          value={
            totalClicks > 0
              ? `${Math.round((totalResponses / totalClicks) * 100)}%`
              : "—"
          }
          sub={totalClicks > 0 ? "Programme-wide" : "No clicks yet"}
          icon={Pointer}
          tone="invite"
        />
      </div>

      <SearchBox placeholder="Find by name, city or batch…" className="max-w-md" />

      <Card>
        {list.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={query ? "Nobody matches that" : "No ambassadors yet"}
            description={
              query ? "Try a different name, city or batch." : "Add some first."
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100 text-[12px] font-extrabold text-ink"
                >
                  {initials(row.name)}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/ambassadors/${row.id}`}
                    className="truncate text-[14px] font-bold text-ink hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="truncate text-[12px] text-ink-soft">
                    {[row.city, row.batch].filter(Boolean).join(" · ") ||
                      "No city or batch"}
                    {row.links > 0
                      ? ` · ${row.links} link${row.links === 1 ? "" : "s"}`
                      : " · no links issued"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{formatNumber(row.clicks)} clicks</Badge>
                  <Badge tone={row.responses > 0 ? "ok" : "neutral"}>
                    {formatNumber(row.responses)} responses
                  </Badge>
                  {row.conversion !== null && (
                    <Badge tone="poll">
                      {Math.round(row.conversion * 100)}%
                    </Badge>
                  )}
                  {row.flagged > 0 && (
                    <Badge tone="bad" dot>
                      <Flag className="size-3" />
                      {row.flagged}
                    </Badge>
                  )}
                </div>

                <span className="tabular w-16 shrink-0 text-right text-[14px] font-extrabold text-ink">
                  {formatNumber(row.pointsEarned)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
