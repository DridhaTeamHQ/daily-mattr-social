import Link from "next/link";
import { Clapperboard } from "lucide-react";

import { AmbassadorNav } from "@/components/ambassador-nav";
import { SearchBox } from "@/components/search-box";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { getCampaignParticipation } from "@/lib/admin/participation";
import { requireAdmin } from "@/lib/admin/queries";
import { matches } from "@/lib/search";
import { formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Ambassadors · Campaigns" };

/**
 * Campaign activity per ambassador.
 *
 * The transpose of the per-campaign page: that one says how a campaign is
 * doing, this one says how a person is doing across all of them. Sorted by
 * approvals, because a big submitted count with few approvals is a different
 * problem from doing nothing at all.
 */
export default async function AmbassadorCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();

  const [{ q }, { rows, campaigns }] = await Promise.all([
    searchParams,
    getCampaignParticipation(),
  ]);

  const query = q ?? "";
  const list = rows.filter((r) => matches(query, r.name, r.city, r.batch));

  const active = rows.filter((r) => r.submitted > 0).length;
  const untouched = rows.length - active;

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Campaign activity
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            What each ambassador has submitted across {campaigns} published
            campaign{campaigns === 1 ? "" : "s"}.
          </p>
        </div>
        <AmbassadorNav />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Taking part"
          value={`${active}/${rows.length}`}
          sub="Submitted at least once"
          icon={Clapperboard}
          tone="brand"
        />
        <Stat
          label="Never submitted"
          value={untouched}
          sub="The list worth chasing"
          icon={Clapperboard}
          tone="invite"
        />
        <Stat
          label="Submissions"
          value={formatNumber(rows.reduce((s, r) => s + r.submitted, 0))}
          sub="All campaigns"
          icon={Clapperboard}
          tone="poll"
        />
      </div>

      <SearchBox placeholder="Find by name, city or batch…" className="max-w-md" />

      <Card>
        {list.length === 0 ? (
          <EmptyState
            icon={Clapperboard}
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
                    {row.campaignsTouched > 0
                      ? ` · ${row.campaignsTouched} campaign${row.campaignsTouched === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {row.submitted === 0 ? (
                    <Badge tone="neutral">nothing yet</Badge>
                  ) : (
                    <>
                      <Badge tone="ok">{row.approved} approved</Badge>
                      {row.waiting > 0 && (
                        <Badge tone="warn">{row.waiting} waiting</Badge>
                      )}
                      {row.rejected > 0 && (
                        <Badge tone="bad">{row.rejected} rejected</Badge>
                      )}
                    </>
                  )}
                </div>

              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
