import { Clapperboard, ExternalLink, Inbox } from "lucide-react";

import Link from "next/link";

import { SectionTabs, CAMPAIGN_TABS } from "@/components/section-tabs";
import { ActionButton } from "@/components/action-button";
import { CreateCampaignDialog } from "@/components/campaign-actions";
import { SearchBox } from "@/components/search-box";
import { InfiniteList } from "@/components/infinite-scroll";
import { createAdminClient } from "@/lib/supabase/admin";
import { matches } from "@/lib/search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { setCampaignStatus } from "@/lib/admin/actions";
import { deleteCampaign } from "@/lib/admin/edit-actions";
import { getAdminCampaigns } from "@/lib/admin/queries";
import { aiEnabled } from "@/lib/ai";
import { cn, formatDate, timeRemaining } from "@/lib/utils";

export const metadata = { title: "Campaigns" };

const STATUS_TONE = {
  live: "ok",
  draft: "neutral",
  ended: "neutral",
  archived: "neutral",
} as const;

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; net?: string }>;
}) {
  const [{ q, net }, all, { data: library }, queue] = await Promise.all([
    searchParams,
    getAdminCampaigns(),
    createAdminClient()
      .from("task_library")
      .select("id, label, platform, default_points, proof_type")
      .eq("active", true)
      .order("platform", { ascending: true, nullsFirst: false })
      .order("label", { ascending: true }),
    // Head-only: the button wants the number, not the rows.
    createAdminClient()
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "needs_review"])
      .then(({ count }) => count ?? 0),
  ]);
  const query = q ?? "";

  /**
   * The four the programme runs on always get a chip, plus anything else in
   * use. An admin deciding where the next reel should go needs to see that
   * YouTube is empty, and a row built only from what exists can never say so.
   */
  const networks = [
    ...PINNED_NETWORKS,
    ...all
      .map((c) => c.platform)
      .filter((p): p is string => Boolean(p) && !PINNED_NETWORKS.includes(p)),
  ].filter((p, i, list) => list.indexOf(p) === i);

  const active = net && networks.includes(net) ? net : null;

  const campaigns = all
    .filter((c) => !active || c.platform === active)
    .filter((c) =>
      matches(query, c.title, c.description, c.expected_handle, c.status),
    );

  return (
    <div className="stagger space-y-5">
      <SectionTabs tabs={CAMPAIGN_TABS} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Campaigns
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Only live campaigns appear on ambassador dashboards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* The queue, reachable from the page that fills it. The count is
              the whole point of the button: "Review" alone gives you no
              reason to press it, and an admin should not have to open the
              queue to find out it is empty. */}
          <Button variant="secondary" asChild>
            <Link href="/admin/review">
              <Inbox aria-hidden />
              Review
              {queue > 0 && (
                <span className="tabular ml-0.5 rounded-full bg-warn px-1.5 text-[11.5px] font-bold text-white">
                  {queue}
                </span>
              )}
            </Link>
          </Button>

          <CreateCampaignDialog aiEnabled={aiEnabled()} library={library ?? []} />
        </div>
      </div>

      <SearchBox
        placeholder="Search campaigns by title, handle or status…"
        className="max-w-md"
      />

      {/* Links rather than state: the filter belongs in the URL, so a
          half-written campaign list is something an admin can send. */}
      <nav aria-label="Filter by network" className="flex flex-wrap gap-2">
        <NetworkChip
          href={query ? `/admin/campaigns?q=${encodeURIComponent(query)}` : "/admin/campaigns"}
          label="All"
          count={all.length}
          active={!active}
        />
        {networks.map((p) => (
          <NetworkChip
            key={p}
            href={`/admin/campaigns?net=${encodeURIComponent(p)}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            label={p}
            count={all.filter((c) => c.platform === p).length}
            active={active === p}
          />
        ))}
      </nav>

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Clapperboard}
            title="No campaigns yet"
            description="Create one, set the tasks, then publish it when you're ready."
          />
        </Card>
      ) : (
        <InfiniteList
          key={`${active ?? "all"}:${query}`}
          className="grid gap-4 lg:grid-cols-2"
          pageSize={12}
        >
          {campaigns.map((c) => (
            // min-w-0: a grid item defaults to min-width:auto, so one long
            // task label was widening the whole column and pushing the page
            // into a horizontal scroll rather than being cut off inside it.
            <li key={c.id} className="min-w-0">
              <Card className="flex h-full flex-col">
                <CardBody className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/campaigns/${c.id}`}
                      className="display text-[19px] text-ink underline decoration-[3px] underline-offset-4 hover:decoration-reel"
                    >
                      {c.title}
                    </Link>
                    <Badge tone={STATUS_TONE[c.status]} dot>
                      {c.status}
                    </Badge>
                    {c.status === "live" && (
                      <Badge tone="reel">{timeRemaining(c.ends_at)}</Badge>
                    )}
                  </div>

                  {c.description && (
                    <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-ink-soft">
                      {c.description}
                    </p>
                  )}

                  {c.status === "draft" && (
                    <p className="mt-2.5 text-[12.5px] font-medium text-warn">
                      Not visible to ambassadors yet — press Publish.
                    </p>
                  )}

                  {/* Library tasks carry whole sentences as labels, and Badge
                      is whitespace-nowrap by design — so these are clipped to
                      the card width with the full text on hover. */}
                  <ul className="mt-3.5 flex flex-wrap gap-1.5">
                    {c.tasks.map((t) => {
                      const label = `${t.label}${t.required ? "" : " · optional"}`;

                      return (
                        <li key={t.id} className="min-w-0 max-w-full">
                          <Badge tone="neutral" className="max-w-full" title={label}>
                            <span className="truncate">{label}</span>
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>

                  <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-ink-soft">
                    <div>
                      <dt className="inline">Handle: </dt>
                      <dd className="inline text-ink">@{c.expected_handle}</dd>
                    </div>
                    <div>
                      <dt className="inline">Submissions: </dt>
                      <dd className="inline text-ink">{c.submissionCount}</dd>
                    </div>
                    <div>
                      <dt className="inline">Created: </dt>
                      <dd className="inline text-ink">
                        {formatDate(c.created_at)}
                      </dd>
                    </div>
                  </dl>
                </CardBody>

                <CardFooter className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/admin/campaigns/${c.id}`}>Analytics</Link>
                  </Button>

                  {c.status === "draft" && (
                    <ActionButton
                      size="sm"
                      action={setCampaignStatus.bind(null, c.id, "live")}
                      confirmMessage={`Publish "${c.title}"? Every active ambassador will see it immediately.`}
                    >
                      Publish
                    </ActionButton>
                  )}

                  {c.status === "live" && (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      action={setCampaignStatus.bind(null, c.id, "ended")}
                      confirmMessage={`End "${c.title}"? Ambassadors stop being able to submit.`}
                    >
                      End campaign
                    </ActionButton>
                  )}

                    <Button size="sm" variant="ghost" asChild>
                    <a
                      href={c.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Reel
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>

                  {c.status === "ended" && (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      action={setCampaignStatus.bind(null, c.id, "live")}
                    >
                      Re-open
                    </ActionButton>
                  )}

                  {/* Only offered while nothing has been submitted. Once there
                      is work against a campaign the action refuses anyway, so
                      showing the button then would be a button that exists to
                      say no — Archive is the answer at that point. */}
                  {c.submissionCount === 0 && (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      className="text-bad hover:bg-bad-tint"
                      action={deleteCampaign.bind(null, c.id)}
                      confirmMessage={`Delete "${c.title}"? It and its ${c.tasks.length} task${c.tasks.length === 1 ? "" : "s"} go for good. This cannot be undone.`}
                    >
                      Delete
                    </ActionButton>
                  )}

                  {/* How far the campaign actually got: active ambassadors
                      who cleared every required task, over the number being
                      asked. It sits beside Review because the two answer the
                      same question from opposite ends — what is finished, and
                      what is still on you. */}
                  <span
                    className="tabular ml-auto text-[12.5px] font-bold text-ink-soft"
                    title="Active ambassadors with every required task approved"
                  >
                    {c.doneCount}/{c.cohortCount} done
                  </span>

                  {/* The queue for this campaign alone. The page-level Review
                      button is the whole programme, which is the wrong list
                      when you are looking at one campaign and want to clear
                      its screenshots. The count is carried for the same
                      reason it is up there: it says whether pressing it is
                      worth anything. */}
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/admin/review?campaign=${c.id}`}>
                      Review
                      {c.openCount > 0 && (
                        <span className="tabular ml-0.5 rounded-full bg-warn px-1.5 text-[11.5px] font-bold text-white">
                          {c.openCount}
                        </span>
                      )}
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </InfiniteList>
      )}
    </div>
  );
}

/** Always offered, so an empty network is visible rather than absent. */
const PINNED_NETWORKS = ["Instagram", "YouTube", "X", "LinkedIn"];

/**
 * One network in the filter row.
 *
 * The count is on the chip because zero is the most useful thing it can say
 * before you press it, and an empty one is dimmed rather than hidden — the
 * gap is the point.
 */
function NetworkChip({
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
