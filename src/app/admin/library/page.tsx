import Link from "next/link";
import {
  CalendarDays,
  FileText,
  Image as ImageIcon,
  Library,
  Link as LinkIcon,
  Repeat,
} from "lucide-react";

import { SectionTabs, CAMPAIGN_TABS } from "@/components/section-tabs";
import { ActionButton } from "@/components/action-button";
import { LibraryTaskDialog } from "@/components/library-actions";
import { SearchBox } from "@/components/search-box";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { setLibraryTaskActive } from "@/lib/admin/library-actions";
import { requireAdmin } from "@/lib/admin/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { matches } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

export const metadata = { title: "Task library" };

const CADENCE_LABEL: Record<string, string> = {
  daily: "Daily",
  twice_weekly: "Twice weekly",
  weekly: "Weekly",
  milestone: "Milestone",
  once: "One-off",
};

const PROOF_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  screenshot: { label: "Screenshot", icon: ImageIcon },
  link: { label: "Link", icon: LinkIcon },
  text: { label: "Written answer", icon: FileText },
  none: { label: "No proof", icon: FileText },
};

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; net?: string }>;
}) {
  await requireAdmin();

  const { q, net } = await searchParams;
  const query = q ?? "";

  const db = createAdminClient();
  const { data } = await db
    .from("task_library")
    .select("*")
    .order("active", { ascending: false })
    .order("platform", { ascending: true, nullsFirst: false })
    .order("label", { ascending: true });

  const all = (data ?? []) as Tables<"task_library">[];

  /**
   * The four the programme runs on, plus every platform the library already
   * has something for. Same rule as Campaigns: an empty one is dimmed rather
   * than absent, because "we have nothing for YouTube" is the useful answer.
   */
  const networks = [
    ...PINNED_NETWORKS,
    ...all
      .map((t) => t.platform)
      .filter((p): p is string => !!p && !PINNED_NETWORKS.includes(p)),
  ].filter((p, i, list) => list.indexOf(p) === i);

  const network = net && networks.includes(net) ? net : null;

  const rows = all
    .filter((task) => !network || task.platform === network)
    .filter((task) =>
      matches(query, task.label, task.platform ?? "", task.cadence ?? ""),
    );

  const active = rows.filter((t) => t.active);
  const retired = rows.filter((t) => !t.active);

  return (
    <div className="stagger space-y-5">
      <SectionTabs tabs={CAMPAIGN_TABS} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Task library
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            The bank campaigns are built from. {active.length} in use.
          </p>
        </div>
        <LibraryTaskDialog />
      </div>

      <Note tone="brand" title="Why a library">
        A task here is a row, so adding a new platform costs an insert rather
        than a code change. Campaigns are assembled from these instead of being
        rebuilt from scratch each time, and the cadence tag is what makes
        &quot;which weekly tasks actually convert&quot; a question with an
        answer.
      </Note>

      <SearchBox
        placeholder="Search by name, platform or cadence…"
        className="max-w-md"
      />

      <nav aria-label="Filter by platform" className="flex flex-wrap gap-2">
        <PlatformChip
          href={link({ q: query })}
          label="All"
          count={all.length}
          active={!network}
        />
        {networks.map((p) => (
          <PlatformChip
            key={p}
            href={link({ q: query, net: p })}
            label={p}
            count={all.filter((t) => t.platform === p).length}
            active={network === p}
          />
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Library}
            title={query ? "Nothing matches that" : "The library is empty"}
            description={
              query
                ? "Try a different name or platform."
                : "Add your first reusable task."
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <ul className="grid gap-3 md:grid-cols-2">
            {active.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </ul>

          {retired.length > 0 && (
            <div>
              <h2 className="display mb-2 text-[15px] text-ink-soft">
                Retired
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {retired.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: Tables<"task_library"> }) {
  const proof = PROOF_META[task.proof_type] ?? PROOF_META.screenshot;
  const ProofIcon = proof.icon;

  return (
    <li>
      <Card className={cn(!task.active && "opacity-60")}>
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-extrabold text-ink">{task.label}</h3>
            {task.platform && <Badge tone="neutral">{task.platform}</Badge>}
            <Badge tone="brand">+{task.default_points}</Badge>
          </div>

          {task.instructions && (
            <p className="mt-2 text-[12.5px] leading-relaxed font-semibold text-ink-soft">
              {task.instructions}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-[11.5px] font-bold text-ink-soft">
              <ProofIcon className="size-3.5" />
              {proof.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-[11.5px] font-bold text-ink-soft">
              {task.cadence === "once" ? (
                <CalendarDays className="size-3.5" />
              ) : (
                <Repeat className="size-3.5" />
              )}
              {CADENCE_LABEL[task.cadence] ?? task.cadence}
            </span>

            <div className="ml-auto">
              <ActionButton
                size="sm"
                variant="secondary"
                action={setLibraryTaskActive.bind(null, task.id, !task.active)}
                confirmMessage={
                  task.active
                    ? `Retire "${task.label}"? Campaigns already using it are untouched — it just stops appearing when you build a new one.`
                    : undefined
                }
              >
                {task.active ? "Retire" : "Restore"}
              </ActionButton>
            </div>
          </div>
        </CardBody>
      </Card>
    </li>
  );
}

/** Always offered, so a platform with nothing in the library is visible. */
const PINNED_NETWORKS = ["Instagram", "YouTube", "X", "LinkedIn"];

/** Keeps the search term when the platform changes, and vice versa. */
function link({ q, net }: { q?: string; net?: string }): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (net) params.set("net", net);
  const query = params.toString();
  return query ? `/admin/library?${query}` : "/admin/library";
}

function PlatformChip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-gray-200 bg-white text-ink hover:bg-gray-50",
        !active && count === 0 && "opacity-55",
      )}
    >
      {label}
      <span className={cn("tabular", active ? "text-white/70" : "text-gray-400")}>
        {count}
      </span>
    </Link>
  );
}
