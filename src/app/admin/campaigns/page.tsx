import {
  Clapperboard,
  ExternalLink,
  Inbox,
} from "lucide-react";

import Link from "next/link";

import { SectionTabs, CAMPAIGN_TABS } from "@/components/section-tabs";
import { ActionButton } from "@/components/action-button";
import { CreateCampaignDialog } from "@/components/campaign-actions";
import { CampaignEditDialog } from "@/components/edit-dialogs";
import { CampaignPreviewDialog } from "@/components/campaign-preview";
import {
  SchedulePublishDialog,
  ScheduledNote,
} from "@/components/schedule-publish";
import {
  CompletionRing,
  Pagination,
  PlatformTile,
  StatusPill,
} from "@/components/list-card";
import { SearchBox } from "@/components/search-box";
import { createCachedAdminClient as createAdminClient } from "@/lib/admin/cached-client";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { setCampaignStatus } from "@/lib/admin/actions";
import { CAMPAIGNS_PAGE_SIZE, getAdminCampaignPage } from "@/lib/admin/queries";
import { aiEnabled } from "@/lib/ai";
import { cn, formatDate, timeRemaining } from "@/lib/utils";

export const metadata = { title: "Tasks" };

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; net?: string; page?: string }>;
}) {
  const { q, net, page: rawPage } = await searchParams;
  const query = q ?? "";
  const pageNumber = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);

  const [list, { data: library }, queue] = await Promise.all([
    // Ten campaigns, fetched as ten — see `getAdminCampaignPage`.
    getAdminCampaignPage({ page: pageNumber, network: net || null, query }),
    (await createAdminClient())
      .from("task_library")
      .select("id, label, platform, default_points, proof_type")
      .eq("active", true)
      .order("platform", { ascending: true, nullsFirst: false })
      .order("label", { ascending: true }),
    // Head-only: the button wants the number, not the rows.
    (await createAdminClient())
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "needs_review"])
      .then(({ count }) => count ?? 0),
  ]);
  const { campaigns, networkCounts } = list;

  /**
   * The four the programme runs on always get a chip, plus anything else in
   * use. An admin deciding where the next reel should go needs to see that
   * YouTube is empty, and a row built only from what exists can never say so.
   */
  const networks = [
    ...PINNED_NETWORKS,
    ...[...networkCounts.keys()].filter((p) => !PINNED_NETWORKS.includes(p)),
  ].filter((p, i, list) => list.indexOf(p) === i);

  const active = net && networks.includes(net) ? net : null;

  /** This list at another page, with the network and search kept. */
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (active) params.set("net", active);
    if (query) params.set("q", query);
    if (target > 1) params.set("page", String(target));
    const text = params.toString();
    return `/admin/campaigns${text ? `?${text}` : ""}`;
  };

  return (
    <div className="stagger space-y-5">
      <SectionTabs tabs={CAMPAIGN_TABS} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Tasks
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
          count={list.allCount}
          active={!active}
        />
        {networks.map((p) => (
          <NetworkChip
            key={p}
            href={`/admin/campaigns?net=${encodeURIComponent(p)}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            label={p}
            count={networkCounts.get(p) ?? 0}
            active={active === p}
          />
        ))}
      </nav>

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Clapperboard}
            title={
              list.total > 0
                ? "Nothing on this page"
                : query || active
                  ? "No campaigns match"
                  : "No campaigns yet"
            }
            description={
              list.total > 0
                ? "This page is past the end of the list."
                : query || active
                  ? "Try a different search or network."
                  : "Create one, set the tasks, then publish it when you're ready."
            }
          />
        </Card>
      ) : (
        <>
        <ul className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((c) => (
            // min-w-0: a grid item defaults to min-width:auto, so one long
            // task label was widening the whole column and pushing the page
            // into a horizontal scroll rather than being cut off inside it.
            <li key={c.id} className="min-w-0">
              <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
                <CardBody className="flex flex-1 flex-col gap-3">
                  {/* Logo tile, title and status on the left, the completion
                      ring on the right: the network and how far the campaign
                      got are what an admin scans a grid of these for, so they
                      carry the colour and everything else stays quiet. */}
                  <div className="flex items-start gap-3">
                    <PlatformTile platform={c.platform} />

                    <div className="min-w-0 flex-1">
                      {/* The title is the way into the campaign's own page —
                          its analytics, people and tasks — so the footer does
                          not need a separate button for it. */}
                      <Link
                        href={`/admin/campaigns/${c.id}`}
                        className="display line-clamp-2 text-[15.5px] leading-tight text-ink hover:text-brand"
                      >
                        {c.title}
                      </Link>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusPill status={c.status} />
                        {/* At every status, not just live: a draft with a
                            deadline two days out is the one worth publishing
                            first, and an ended campaign should say so. */}
                        {c.ends_at && (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                            {timeRemaining(c.ends_at)}
                          </span>
                        )}
                        {/* 'draft' is true of a scheduled draft and of one
                            nobody has touched; this tells them apart. */}
                        {c.status === "draft" && c.publish_at && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                            scheduled
                          </span>
                        )}
                      </div>
                    </div>

                    <CompletionRing done={c.doneCount} of={c.cohortCount} />
                  </div>

                  {c.description && (
                    <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-soft">
                      {c.description}
                    </p>
                  )}

                  {c.status === "draft" &&
                    (c.publish_at ? (
                      <ScheduledNote publishAt={c.publish_at} />
                    ) : (
                      <p className="text-[12.5px] font-medium text-warn">
                        Not visible to ambassadors yet — press Publish.
                      </p>
                    ))}

                  {/* One line of facts. The tasks, handle and end date are on
                      the campaign's page. */}
                  <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-soft">
                    <span title="Active ambassadors with every required task approved">
                      <span className="font-bold text-ink">
                        {c.doneCount}/{c.cohortCount}
                      </span>{" "}
                      completed
                    </span>
                    <span>
                      <span className="font-bold text-ink">{c.submissionCount}</span>{" "}
                      submission{c.submissionCount === 1 ? "" : "s"}
                    </span>
                    {c.openCount > 0 && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700">
                        {c.openCount} to review
                      </span>
                    )}
                    <span className="ml-auto text-ink-faint">{formatDate(c.created_at)}</span>
                  </p>
                </CardBody>

                <CardFooter className="flex flex-wrap items-center gap-2">
                  {/* Offered at every status, live included. Publishing is not
                      a freeze: the live campaign is precisely the one you find
                      the typo in. */}
                  <CampaignEditDialog
                    campaign={c}
                    tasks={c.tasks.map((t) => ({
                      id: t.id,
                      label: t.label,
                      label_override: t.label_override,
                      points: t.points,
                      required: t.required,
                      instructions: t.instructions,
                      submitted: t.submitted,
                    }))}
                  />

                  {/* Next to Edit, because it answers the question Edit
                      raises: what an ambassador actually meets. */}
                  <CampaignPreviewDialog
                    campaign={c}
                    tasks={c.tasks.map((t) => ({
                      id: t.id,
                      label: t.label,
                      instructions: t.instructions,
                      required: t.required,
                      type: t.type,
                    }))}
                  />

                  {/* Publish and Schedule are the same decision asked at two
                      different times, so they sit together. */}
                  {c.status === "draft" && (
                    <>
                      <ActionButton
                        size="sm"
                        action={setCampaignStatus.bind(null, c.id, "live")}
                        confirmMessage={
                          c.publish_at
                            ? `Publish "${c.title}" now? This cancels the schedule and every active ambassador sees it immediately.`
                            : `Publish "${c.title}"? Every active ambassador will see it immediately.`
                        }
                      >
                        Publish now
                      </ActionButton>

                      <SchedulePublishDialog
                        kind="campaign"
                        id={c.id}
                        publishAt={c.publish_at}
                        endsAt={c.ends_at}
                      />
                    </>
                  )}

                  {c.status === "live" && (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      action={setCampaignStatus.bind(null, c.id, "ended")}
                      confirmMessage={`End "${c.title}"? Ambassadors stop being able to submit.`}
                    >
                      End
                    </ActionButton>
                  )}

                  {c.status === "ended" && (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      action={setCampaignStatus.bind(null, c.id, "live")}
                    >
                      Re-open
                    </ActionButton>
                  )}

                  {/* Delete lives on the campaign's own page, not out here:
                      an irreversible action repeated down a grid of cards is
                      one mis-aimed click from deleting the wrong campaign. */}

                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" asChild>
                      <a
                        href={c.instagram_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open the post"
                        aria-label="Open the post"
                      >
                        <ExternalLink aria-hidden />
                      </a>
                    </Button>

                    {/* The queue for this campaign alone, filled when there is
                        something in it so it reads as the thing to do next. */}
                    <Button
                      size="sm"
                      variant={c.openCount > 0 ? "primary" : "secondary"}
                      asChild
                    >
                      <Link href={`/admin/review?campaign=${c.id}`}>
                        <Inbox aria-hidden />
                        Review
                        {c.openCount > 0 && (
                          <span className="tabular ml-0.5 rounded-full bg-white/25 px-1.5 text-[11.5px] font-bold">
                            {c.openCount}
                          </span>
                        )}
                      </Link>
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>

        <Pagination
          page={list.page}
          pageCount={list.pageCount}
          pageSize={CAMPAIGNS_PAGE_SIZE}
          total={list.total}
          noun="campaigns"
          shown={campaigns.length}
          hrefFor={pageHref}
        />
        </>
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
