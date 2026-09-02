import Link from "next/link";
import { Trophy, Users } from "lucide-react";

import { AmbassadorNav } from "@/components/ambassador-nav";
import { FilterChips, type ChipOption } from "@/components/filter-chips";
import { SearchBox } from "@/components/search-box";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/admin/queries";
import { matches } from "@/lib/search";
import { createCachedClient as createClient } from "@/lib/admin/cached-client";
import { cn, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Completion leaderboard" };

export default async function AdminLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; batch?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const city = params.city?.trim() || null;
  const batch = params.batch?.trim() || null;
  const query = params.q ?? "";
  const supabase = await createClient();
  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase.rpc("completion_leaderboard", { limit_count: 1000 }),
    supabase
      .from("profiles")
      .select("id, city, batch")
      .eq("role", "ambassador")
      .eq("status", "active"),
  ]);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const cities = [...new Set((profiles ?? []).map((profile) => profile.city?.trim()).filter(Boolean))].sort() as string[];
  const batches = [...new Set((profiles ?? []).map((profile) => profile.batch?.trim()).filter(Boolean))].sort() as string[];
  const list = (rows ?? []).filter((row) => {
    const profile = profileById.get(row.ambassador_id);
    return (
      (!city || profile?.city === city) &&
      (!batch || profile?.batch === batch) &&
      matches(query, row.full_name, row.college, profile?.city, profile?.batch)
    );
  });

  const grouped = new Map<string, { members: number; completion: number; approved: number; tasks: number }>();
  for (const row of list) {
    const batchName = profileById.get(row.ambassador_id)?.batch || "No batch";
    const current = grouped.get(batchName) ?? { members: 0, completion: 0, approved: 0, tasks: 0 };
    current.members += 1;
    current.completion += row.completion_pct;
    current.approved += row.approved_tasks;
    current.tasks += row.total_tasks;
    grouped.set(batchName, current);
  }

  const href = (next: Record<string, string | null>) => {
    const search = new URLSearchParams();
    const merged = { q: query || null, city, batch, ...next };
    for (const [key, value] of Object.entries(merged)) if (value) search.set(key, value);
    const value = search.toString();
    return value ? `/admin/leaderboard?${value}` : "/admin/leaderboard";
  };
  const chips = (items: string[], param: "city" | "batch", allLabel: string): ChipOption[] => [
    { key: "", label: allLabel, href: href({ [param]: null }) },
    ...items.map((item) => ({ key: item, label: item, href: href({ [param]: item }) })),
  ];

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">Completion leaderboard</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">Current-month ranking by approved task completion.</p>
        </div>
        <AmbassadorNav />
      </div>

      <div className="space-y-2.5">
        {cities.length > 0 && <FilterChips label="City" options={chips(cities, "city", "All cities")} active={city ?? ""} />}
        {batches.length > 0 && <FilterChips label="Batch" options={chips(batches, "batch", "All batches")} active={batch ?? ""} />}
      </div>

      {grouped.size > 1 && (
        <Card>
          <CardBody>
            <h2 className="display text-[16px] text-ink">Batch completion</h2>
            <ul className="mt-3 divide-y divide-gray-100">
              {[...grouped.entries()].sort(([, left], [, right]) => right.completion / right.members - left.completion / left.members).map(([name, value]) => (
                <li key={name} className="flex items-center gap-3 py-2.5">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100 text-ink-soft"><Users className="size-4" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-extrabold text-ink">{name}</p><p className="text-[12px] text-ink-soft">{value.members} member{value.members === 1 ? "" : "s"}</p></div>
                  <p className="tabular text-[14px] font-extrabold text-ink">{formatNumber(Math.round(value.completion / value.members))}%</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <SearchBox placeholder="Find by name, college/office, city or batch..." />
      <Card>
        {list.length === 0 ? (
          <EmptyState icon={Trophy} title={query ? "Nobody matches that" : "No active tasks yet"} description={query ? "Try a different name, city or batch." : "The completion ranking appears when this month's tasks are published."} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map((row) => {
              const profile = profileById.get(row.ambassador_id);
              return (
                <li key={row.ambassador_id} className="flex items-center gap-4 px-5 py-3">
                  <span className={cn("w-7 shrink-0 text-center text-[14px] font-extrabold", row.position <= 3 ? "text-brand" : "text-ink-faint")}>{row.position}</span>
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100 text-[12px] font-extrabold text-ink">{initials(row.full_name)}</span>
                  <div className="min-w-0 flex-1"><Link href={`/admin/ambassadors/${row.ambassador_id}`} className="truncate text-[14px] font-bold text-ink hover:underline">{row.full_name}</Link><p className="truncate text-[12px] text-ink-soft">{[row.college, profile?.city, profile?.batch].filter(Boolean).join(" - ") || "No college/office, city or batch set"}</p></div>
                  <div className="shrink-0 text-right"><p className="tabular text-[15px] font-extrabold text-ink">{formatNumber(row.completion_pct)}%</p><p className="text-[11.5px] text-ink-soft">{row.approved_tasks}/{row.total_tasks} approved</p></div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
