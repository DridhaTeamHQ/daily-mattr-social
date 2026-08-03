import { Coins, Gift, TrendingUp, Users } from "lucide-react";

import { SearchBox } from "@/components/search-box";
import { matches } from "@/lib/search";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { getReferralSummary } from "@/lib/admin/queries";
import { cn, formatDate, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Referrals" };

const STATUS_TONE = {
  active: "ok",
  invited: "warn",
  suspended: "bad",
} as const;

export default async function AdminReferralsPage({
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
      <div>
        <h1 className="display text-[26px] leading-none text-ink">Referrals</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          Every ambassador&apos;s code, and how many app downloads it has
          brought in.
        </p>
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
          Downloads are credited by importing a CSV from the DailyMattr app
          that pairs each referral code with the new user it brought in. Until
          that import runs, every code here reads zero.
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
              <thead className="border-b-[3px] border-ink bg-canvas-sunk">
                <tr className="text-[11.5px] font-extrabold tracking-wide text-ink uppercase">
                  <th className="px-4 py-3">Ambassador</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3 text-right">Downloads</th>
                  <th className="px-4 py-3 text-right">Points paid</th>
                  <th className="px-4 py-3">Last one</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y-[3px] divide-ink">
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
                                  "brut-sm",
                                  ["bg-brand", "bg-canvas-sunk", "bg-invite-tint"][i],
                                )
                              : "text-ink-faint",
                          )}
                        >
                          {i + 1}
                        </span>

                        <span
                          aria-hidden
                          className="brut-sm grid size-8 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-extrabold text-ink"
                        >
                          {initials(row.full_name || row.email)}
                        </span>

                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-extrabold text-ink">
                            {row.full_name || "—"}
                          </p>
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

                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "tabular display inline-block text-[18px]",
                          row.confirmed > 0 ? "text-ink" : "text-ink-faint",
                        )}
                      >
                        {formatNumber(row.confirmed)}
                      </span>
                      {row.voided > 0 && (
                        <p className="text-[11.5px] font-bold text-bad">
                          {row.voided} voided
                        </p>
                      )}
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
