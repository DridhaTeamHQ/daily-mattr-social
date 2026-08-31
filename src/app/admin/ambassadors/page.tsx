import Link from "next/link";
import { MailCheck, Upload, UserCheck, UserMinus, Users } from "lucide-react";

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
import { Stat } from "@/components/ui/stat";
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
  searchParams: Promise<{
    q?: string;
    group?: string;
    batch?: string;
    city?: string;
    status?: string;
  }>;
}) {
  const [{ q, group, batch, city, status }, all] = await Promise.all([
    searchParams,
    getAmbassadors(),
  ]);
  const query = q ?? "";
  const groupBy: Grouping = GROUPINGS.some((g) => g.key === group)
    ? (group as Grouping)
    : "none";

  /**
   * Every batch and every city on the programme, named in order with "Not set"
   * last, each with how many people it holds.
   *
   * Counted from `all` so the pickers keep offering their options while a
   * search or the other picker is narrowing the table — a filter that removes
   * its own options is a filter you cannot get back out of.
   */
  const batches = tally(all, (r) => r.batch);
  const cities = tally(all, (r) => r.city);

  // A value the list doesn't have is ignored rather than shown as an empty
  // table: a stale link should land on the list, not on a dead end.
  const batchFilter = batches.some(([name]) => name === batch) ? batch! : "";
  const cityFilter = cities.some(([name]) => name === city) ? city! : "";
  const statusFilter = STATUSES.some((name) => name === status)
    ? (status as Status)
    : "";

  const rows = all.filter(
    (r) =>
      (!batchFilter || (r.batch || NOT_SET) === batchFilter) &&
      (!cityFilter || (r.city || NOT_SET) === cityFilter) &&
      (!statusFilter || r.status === statusFilter) &&
      matches(query, r.full_name, r.email, r.college, r.city, r.batch, r.referral_code),
  );

  // What every control links back out of, so changing one keeps the rest.
  const here: View = {
    group: groupBy,
    q: query,
    batch: batchFilter,
    city: cityFilter,
    status: statusFilter,
  };

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

  /**
   * Counted from `all`, never from the filtered rows.
   *
   * These describe the programme, not the current search — "12 invited" has to
   * mean twelve people waiting to sign in, not twelve people whose name
   * happens to contain the letters someone typed. The heading line above
   * already says how many rows the filter matched.
   */
  const active = all.filter((r) => r.status === "active").length;
  const invited = all.filter((r) => r.status === "invited").length;
  const suspended = all.filter((r) => r.status === "suspended").length;
  const statusCounts = { active, invited, suspended };

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Ambassadors
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            {query || batchFilter || cityFilter || statusFilter
              ? `${rows.length} of ${all.length}${
                  batchFilter || cityFilter || statusFilter
                    ? ` in ${[
                        statusFilter ? STATUS_LABEL[statusFilter] : "",
                        batchFilter,
                        cityFilter,
                      ]
                        .filter(Boolean)
                        .join(", ")}`
                    : ""
                }${query ? ` matching "${query}"` : ""}`
              : `${all.length} ${all.length === 1 ? "person" : "people"} on the programme.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AmbassadorNav />
          <NavSelect
            label="Group"
            value={listHref(here)}
            options={GROUPINGS.map((g) => ({
              value: listHref({ ...here, group: g.key }),
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

      {/* Invited is the one that needs watching: it is the number of people
          who were emailed a password and have not used it yet, which is a
          follow-up list rather than a statistic. Suspended appears only when
          there is one — a permanent "0 suspended" is furniture. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Total"
          value={all.length}
          sub="On the programme"
          icon={Users}
          tone="brand"
        />
        <Stat
          label="Active"
          value={active}
          sub="Signed in and earning"
          icon={UserCheck}
          tone="poll"
        />
        <Stat
          label="Invited"
          value={invited}
          sub={invited ? "Yet to set a password" : "Everyone is set up"}
          icon={MailCheck}
          tone="invite"
        />
        {suspended > 0 && (
          <Stat
            label="Suspended"
            value={suspended}
            sub="Not earning"
            icon={UserMinus}
            tone="reel"
          />
        )}
      </div>

      {/* Every way of narrowing the list on one line, with the search:
          they all do the same job, and the row above is the view itself —
          what it is grouped by, and the two things you can add to it. Each
          picker is hidden when there is nothing to choose between; a select
          with one option is furniture. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SearchBox
          placeholder="Search by name, email, college/office, city, batch or code…"
          className="w-full max-w-md"
        />
        <NavSelect
          label="Status"
          value={listHref(here)}
          options={[
            { value: listHref({ ...here, status: "" }), label: "Any status" },
            ...STATUSES.filter((name) => statusCounts[name] > 0).map((name) => ({
              value: listHref({ ...here, status: name }),
              label: `${STATUS_LABEL[name]} (${statusCounts[name]})`,
            })),
          ]}
        />
        {batches.length > 1 && (
          <NavSelect
            label="Batch"
            value={listHref(here)}
            options={[
              { value: listHref({ ...here, batch: "" }), label: "All batches" },
              ...batches.map(([name, count]) => ({
                value: listHref({ ...here, batch: name }),
                label: `${name} (${count})`,
              })),
            ]}
          />
        )}
        {cities.length > 1 && (
          <NavSelect
            label="City"
            value={listHref(here)}
            options={[
              { value: listHref({ ...here, city: "" }), label: "All cities" },
              ...cities.map(([name, count]) => ({
                value: listHref({ ...here, city: name }),
                label: `${name} (${count})`,
              })),
            ]}
          />
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={
              query || batchFilter || cityFilter || statusFilter
                ? "Nobody matches that"
                : "No ambassadors yet"
            }
            description={
              query || batchFilter || cityFilter || statusFilter
                ? "Try a different name or code — or another status, batch or city."
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
                key={`${groupBy}:${batchFilter}:${cityFilter}:${statusFilter}:${query}`}
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

/** The three the table can be filtered down to, in the order they read. */
const STATUSES = ["active", "invited", "suspended"] as const;

type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  invited: "Invited",
  suspended: "Suspended",
};

type View = {
  group: Grouping;
  q: string;
  batch: string;
  city: string;
  status: Status | "";
};

/** One URL for the whole view, so changing one control keeps the others. */
function listHref({ group, q, batch, city, status }: View): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (group !== "none") params.set("group", group);
  if (batch) params.set("batch", batch);
  if (city) params.set("city", city);
  if (status) params.set("status", status);
  const query = params.toString();
  return query ? `/admin/ambassadors?${query}` : "/admin/ambassadors";
}

/**
 * Counts one field across the list, named in order with "Not set" last.
 *
 * "Not set" sinks to the bottom for the same reason it does in the grouped
 * table: it is a gap to fill, not a cohort to pick out.
 */
function tally<T>(
  rows: T[],
  pick: (row: T) => string | null,
): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row) || NOT_SET;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => {
    if (a[0] === NOT_SET) return 1;
    if (b[0] === NOT_SET) return -1;
    return a[0].localeCompare(b[0]);
  });
}
