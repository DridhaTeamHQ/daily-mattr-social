import { Coins, Gift, TrendingUp, Users } from "lucide-react";

import Link from "next/link";

import { AmbassadorNav } from "@/components/ambassador-nav";
import { DownloadsCell } from "@/components/downloads-cell";
import { SearchBox } from "@/components/search-box";
import { matches } from "@/lib/search";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { getReferralSummary } from "@/lib/admin/queries";
import { cn, formatDate, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Installs" };

const STATUS_TONE = {
  active: "ok",
  invited: "warn",
  suspended: "bad",
} as const;

export default async function AdminInstallsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, summary] = await Promise.all([
    searchParams,
    getReferralSummary(),
  ]);

  const query = q ?? "";
  const rows = summary.rows.filter((r) =>
    matches(query, r.full_name, r.email, r.college, r.referral_code),
  );

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
        <h1 className="display text-[26px] leading-none text-ink">Installs</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          Every ambassador&apos;s code, and how many app downloads it has
          brought in.
        </p>
        </div>
        <AmbassadorNav />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Confirmed downloads"
          value={summary.totals.confirmed}
          sub="Across all codes"
          icon={Gift}
          tone="invite"
        />
        <Stat
          label="Ambassadors converting"
          value={summary.totals.ambassadorsWithAny}
          sub={`of ${summary.rows.length} on the programme`}
          icon={Users}
          tone="brand"
        />
        <Stat
          label="Points paid"
          value={summary.totals.pointsPaid}
          sub="For referrals only"
          icon={Coins}
          tone="rank"
        />
        <Stat
          label="Voided"
          value={summary.totals.voided}
          sub={summary.totals.voided > 0 ? "Reversed after import" : "None"}
          icon={TrendingUp}
          tone="reel"
        />
      </div>

      <SearchBox
        placeholder="Search by name, email, college or code…"
        className="max-w-md"
      />

      {summary.totals.confirmed === 0 && (
        <Note tone="warn" title="No conversions yet">
          Click any download number to set it by hand. Points are credited
          automatically, and the ambassador is notified.
        </Note>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Gift}
            title={query ? "Nobody matches that" : "No ambassadors yet"}
            description={
              query
                ? "Try a different name, email or code."
                : "Add ambassadors and their referral codes appear here automatically."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr className="text-[11.5px] font-extrabold tracking-wide text-ink uppercase">
                  <th className="px-4 py-3">Ambassador</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3 text-right">Downloads (editable)</th>
                  <th className="px-4 py-3 text-right">Points paid</th>
                  <th className="px-4 py-3">Last one</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <tr key={row.id} className="hover:bg-canvas-sunk/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {/* Only the top three get a rank chip — beyond that it
                            is a list, not a podium. */}
                        <span
                          className={cn(
                            "tabular grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-extrabold text-ink",
                            !query && i < 3 && row.confirmed > 0
                              ? cn(
                                  ["bg-brand", "bg-canvas-sunk", "bg-invite-tint"][i],
                                )
                              : "text-ink-faint",
                          )}
                        >
                          {i + 1}
                        </span>

                        <span
                          aria-hidden
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-extrabold text-ink"
                        >
                          {initials(row.full_name || row.email)}
                        </span>

                        <div className="min-w-0">
                          <Link
                            href={`/admin/ambassadors/${row.id}`}
                            className="truncate text-[13.5px] font-extrabold text-ink underline decoration-[3px] underline-offset-4 hover:decoration-invite"
                          >
                            {row.full_name || "—"}
                          </Link>
                          <p className="truncate text-[12px] text-ink-soft">
                            {row.college ?? row.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <code className="font-mono text-[12.5px] font-bold text-ink">
                        {row.referral_code}
                      </code>
                    </td>

                    <td className="px-4 py-3">
                      <DownloadsCell
                        profileId={row.id}
                        name={row.full_name || row.email}
                        value={row.confirmed}
                        voided={row.voided}
                      />
                    </td>

                    <td className="tabular px-4 py-3 text-right text-[13.5px] font-extrabold text-ink">
                      {formatNumber(row.pointsPaid)}
                    </td>

                    <td className="px-4 py-3 text-[12.5px] text-ink-soft">
                      {row.lastConversion ? formatDate(row.lastConversion) : "—"}
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[row.status]} dot>
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
