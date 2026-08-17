import Link from "next/link";
import { Upload, Users } from "lucide-react";

import { AmbassadorNav } from "@/components/ambassador-nav";
import { AmbassadorDetailsDialog } from "@/components/ambassador-details-dialog";
import { NavSelect } from "@/components/nav-select";
import { ActionButton } from "@/components/action-button";
import { ReasonDialog } from "@/components/reason-dialog";
import { SearchBox } from "@/components/search-box";
import { InfiniteTableBody } from "@/components/infinite-scroll";
import { matches } from "@/lib/search";
import {
  AddAmbassadorDialog,
  ResetPasswordDialog,
} from "@/components/ambassador-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { setAmbassadorStatus } from "@/lib/admin/actions";
import { getAmbassadors } from "@/lib/admin/queries";
import { formatDate, initials } from "@/lib/utils";

export const metadata = { title: "Ambassadors" };

const STATUS_TONE = {
  active: "ok",
  invited: "warn",
  suspended: "bad",
} as const;

export default async function AmbassadorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string }>;
}) {
  const [{ q, group }, all] = await Promise.all([
    searchParams,
    getAmbassadors(),
  ]);
  const query = q ?? "";
  const groupBy: Grouping = GROUPINGS.some((g) => g.key === group)
    ? (group as Grouping)
    : "none";

  const rows = all.filter((r) =>
    matches(query, r.full_name, r.email, r.college, r.city, r.batch, r.referral_code),
  );

  /**
   * Rows in groups, or one unlabelled group when grouping is off.
   *
   * Sorted by size — the biggest college or batch is usually the one being
   * looked for, and alphabetical order buries it behind whoever happens to
   * start with an A. "Not set" always sinks to the bottom: it is a gap to
   * fill, not a cohort to compare.
   */
  const grouped: [string | null, typeof rows][] =
    groupBy === "none"
      ? [[null, rows]]
      : (() => {
          const buckets = new Map<string, typeof rows>();
          for (const row of rows) {
            const key =
              (groupBy === "city"
                ? row.city
                : groupBy === "batch"
                  ? row.batch
                  : row.college) || NOT_SET;
            const list = buckets.get(key) ?? [];
            list.push(row);
            buckets.set(key, list);
          }
          return [...buckets.entries()].sort((a, b) => {
            if (a[0] === NOT_SET) return 1;
            if (b[0] === NOT_SET) return -1;
            return b[1].length - a[1].length || a[0].localeCompare(b[0]);
          });
        })();

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Ambassadors
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            {query
              ? `${rows.length} of ${all.length} matching "${query}"`
              : `${all.length} ${all.length === 1 ? "person" : "people"} on the programme.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AmbassadorNav />
          <NavSelect
            label="Group"
            value={groupHref(groupBy, query)}
            options={GROUPINGS.map((g) => ({
              value: groupHref(g.key, query),
              label: g.label,
            }))}
          />
          <Button variant="secondary" asChild>
            <Link href="/admin/ambassadors/import">
              <Upload aria-hidden />
              Import CSV
            </Link>
          </Button>
          <AddAmbassadorDialog />
        </div>
      </div>

      <SearchBox
        placeholder="Search by name, email, college/office, city, batch or code…"
        className="max-w-md"
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={query ? "Nobody matches that" : "No ambassadors yet"}
            description={
              query
                ? "Try a different name, email or code."
                : "Add your first student — you'll get a temporary password to pass on, and they pick their own on first sign-in."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Horizontal scroll rather than hiding columns: an admin comparing
              ambassador details needs the key fields next to the names. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left">
              <thead className="border-b border-line bg-canvas-sunk">
                <tr className="text-[11.5px] tracking-wide text-ink-faint uppercase">
                  <th className="px-4 py-2.5 font-medium">Ambassador</th>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>

              <InfiniteTableBody
                key={`${groupBy}:${query}`}
                colSpan={5}
                pageSize={25}
              >
                {grouped.flatMap(([heading, members]) => [
                  // A header row rather than a table per group: the columns
                  // have to keep lining up down the whole page.
                  heading !== null && (
                    <tr key={`h-${heading}`} className="bg-canvas-sunk">
                      <td
                        colSpan={5}
                        className="px-4 py-2 text-[11.5px] font-extrabold tracking-wide text-ink-soft uppercase"
                      >
                        {heading}
                        <span className="tabular ml-2 font-bold text-ink-faint">
                          {members.length}
                        </span>
                      </td>
                    </tr>
                  ),
                  ...members.map((row) => (
                  <tr key={row.id} className="hover:bg-canvas-sunk/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="brut-sm grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-extrabold text-ink"
                        >
                          {initials(row.full_name || row.email)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/ambassadors/${row.id}`}
                            className="truncate text-[13.5px] font-extrabold text-ink underline decoration-[3px] underline-offset-4 hover:decoration-reel"
                          >
                            {row.full_name || "—"}
                          </Link>
                          <p className="truncate text-[12px] text-ink-soft">
                            {[row.college, row.city, row.batch]
                              .filter(Boolean)
                              .join(" · ") || row.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <code className="font-mono text-[12.5px] text-ink-soft">
                        {row.referral_code}
                      </code>
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[row.status]} dot>
                        {row.status}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 text-[12.5px] text-ink-soft">
                      {formatDate(row.created_at)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {/* Same dialog as the one on their own page. Fixing a
                            misspelled name or a missing batch is the most
                            common thing an admin does from this list, and
                            opening a whole page to do it is a detour. */}
                        <AmbassadorDetailsDialog
                          profile={row}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                        />

                        <ResetPasswordDialog
                          profileId={row.id}
                          name={row.full_name || row.email}
                        />

                        {row.status === "suspended" ? (
                          <ActionButton
                            variant="ghost"
                            size="sm"
                            action={setAmbassadorStatus.bind(null, row.id, "active")}
                          >
                            Reinstate
                          </ActionButton>
                        ) : (
<ReasonDialog
                            title={`Suspend ${row.full_name || row.email}`}
                            description="They keep their login and history but stop earning. The reason is sent to them and stays on their record."
                            label="Reason"
                            placeholder="Screenshots did not match the campaign"
                            confirmLabel="Suspend"
                            action={setAmbassadorStatus.bind(
                              null,
                              row.id,
                              "suspended",
                            )}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Suspend
                              </Button>
                            }
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                  )),
                ])}
              </InfiniteTableBody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const NOT_SET = "Not set";

const GROUPINGS = [
  { key: "none", label: "No grouping" },
  { key: "college", label: "By college/office" },
  { key: "city", label: "By city" },
  { key: "batch", label: "By batch" },
] as const;

type Grouping = (typeof GROUPINGS)[number]["key"];

/** Keeps the search term when the grouping changes. */
function groupHref(group: Grouping, q: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (group !== "none") params.set("group", group);
  const query = params.toString();
  return query ? `/admin/ambassadors?${query}` : "/admin/ambassadors";
}
