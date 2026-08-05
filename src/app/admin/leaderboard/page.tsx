import Link from "next/link";
import { Trophy, Users } from "lucide-react";

import { FilterChips, type ChipOption } from "@/components/filter-chips";
import { SearchBox } from "@/components/search-box";
import { SectionTabs, AMBASSADOR_TABS } from "@/components/section-tabs";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/admin/queries";
import { createClient } from "@/lib/supabase/server";
import { matches } from "@/lib/search";
import { cn, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Leaderboard" };

const WINDOWS = [
  { key: "day", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
] as const;

type WindowKey = (typeof WINDOWS)[number]["key"];

function isWindow(value: string | undefined): value is WindowKey {
  return WINDOWS.some((w) => w.key === value);
}

/**
 * The admin leaderboard.
 *
 * Same underlying function as the student board, but with the batch view
 * alongside it — an admin is asking "which group is pulling its weight",
 * which the individual ranking cannot answer on its own.
 */
export default async function AdminLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; window?: string; city?: string; batch?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const window: WindowKey = isWindow(params.window) ? params.window : "all";
  const city = params.city?.trim() || null;
  const batch = params.batch?.trim() || null;
  const query = params.q ?? "";

  const supabase = await createClient();

  const [{ data: rows }, { data: batches }, { data: profiles }] = await Promise.all([
    supabase.rpc("leaderboard_window", {
      window_key: window,
      city_filter: city,
      batch_filter: batch,
      phase_filter: null,
      limit_count: 500,
    }),
    supabase.rpc("batch_standings", { window_key: window }),
    supabase
      .from("profiles")
      .select("city, batch")
      .eq("role", "ambassador")
      .eq("status", "active"),
  ]);

  const cities = [
    ...new Set((profiles ?? []).map((p) => p.city?.trim()).filter(Boolean)),
  ].sort() as string[];
  const batchNames = [
    ...new Set((profiles ?? []).map((p) => p.batch?.trim()).filter(Boolean)),
  ].sort() as string[];

  const list = (rows ?? []).filter((r) =>
    matches(query, r.full_name, r.college, r.city, r.batch),
  );

  const href = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    const merged = { q: query || null, window, city, batch, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === "window" && value === "all")) sp.set(key, value);
    }
    const qs = sp.toString();
    return qs ? `/admin/leaderboard?${qs}` : "/admin/leaderboard";
  };

  const chips = (
    items: string[],
    param: "city" | "batch",
    allLabel: string,
  ): ChipOption[] => [
    { key: "", label: allLabel, href: href({ [param]: null }) },
    ...items.map((item) => ({
      key: item,
      label: item,
      href: href({ [param]: item }),
    })),
  ];

  return (
    <div className="stagger space-y-5">
      <SectionTabs tabs={AMBASSADOR_TABS} />

      <div>
        <h1 className="display text-[26px] leading-none text-ink">Leaderboard</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          Who is earning, over the window you pick.
        </p>
      </div>

      <div className="space-y-2.5">
        <FilterChips
          label="When"
          options={WINDOWS.map((w) => ({
            key: w.key,
            label: w.label,
            href: href({ window: w.key }),
          }))}
          active={window}
        />
        {cities.length > 0 && (
          <FilterChips
            label="City"
            options={chips(cities, "city", "All cities")}
            active={city ?? ""}
          />
        )}
        {batchNames.length > 0 && (
          <FilterChips
            label="Batch"
            options={chips(batchNames, "batch", "All batches")}
            active={batch ?? ""}
          />
        )}
      </div>

      {/* ─── Batch standings ───────────────────────────────────────────────── */}
      {(batches ?? []).length > 1 && (
        <Card>
          <CardBody>
            <h2 className="display text-[16px] text-ink">Batch vs batch</h2>
            <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
              Average per head as well as the total — a batch of thirty will
              always out-total a batch of eight.
            </p>

            <ul className="mt-3 divide-y divide-gray-100">
              {(batches ?? []).map((row) => (
                <li key={row.batch} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100 text-ink-soft"
                  >
                    <Users className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-extrabold text-ink">
                      {row.batch}
                    </p>
                    <p className="text-[12px] text-ink-soft">
                      {row.members} member{row.members === 1 ? "" : "s"} ·{" "}
                      {formatNumber(row.downloads)} downloads
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[14px] font-extrabold text-ink">
                      {formatNumber(row.points)}
                    </p>
                    <p className="text-[11.5px] text-ink-soft">
                      {formatNumber(row.avg_points)} each
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <SearchBox placeholder="Find by name, college, city or batch…" />

      <Card>
        {list.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={query ? "Nobody matches that" : "Nothing in this window"}
            description={
              query
                ? "Try a different name, city or batch."
                : "Nobody earned points in the period you picked."
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map((row) => (
              <li
                key={row.ambassador_id}
                className="flex items-center gap-4 px-5 py-3"
              >
                <span
                  className={cn(
                    "w-7 shrink-0 text-center text-[14px] font-extrabold",
                    row.position <= 3 ? "text-brand" : "text-ink-faint",
                  )}
                >
                  {row.position}
                </span>
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100 text-[12px] font-extrabold text-ink"
                >
                  {initials(row.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/ambassadors/${row.ambassador_id}`}
                    className="truncate text-[14px] font-bold text-ink hover:underline"
                  >
                    {row.full_name}
                  </Link>
                  <p className="truncate text-[12px] text-ink-soft">
                    {[row.college, row.city, row.batch].filter(Boolean).join(" · ") ||
                      "No college, city or batch set"}
                  </p>
                </div>
                <span className="tabular shrink-0 text-[15px] font-extrabold text-ink">
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
