import { Clapperboard, ExternalLink, Inbox } from "lucide-react";

import Link from "next/link";

import { SectionTabs, CAMPAIGN_TABS } from "@/components/section-tabs";
import { ActionButton } from "@/components/action-button";
import { CreateCampaignDialog } from "@/components/campaign-actions";
import { SearchBox } from "@/components/search-box";
import { createAdminClient } from "@/lib/supabase/admin";
import { matches } from "@/lib/search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { setCampaignStatus } from "@/lib/admin/actions";
import { getAdminCampaigns } from "@/lib/admin/queries";
import { aiEnabled } from "@/lib/ai";
import { formatDate, timeRemaining } from "@/lib/utils";

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
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, all, { data: library }, queue] = await Promise.all([
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
  const campaigns = all.filter((c) =>
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

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Clapperboard}
            title="No campaigns yet"
            description="Create one, set the points for each task, then publish it when you're ready."
          />
        </Card>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((c) => (
            <li key={c.id}>
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

                  <ul className="mt-3.5 flex flex-wrap gap-1.5">
                    {c.tasks.map((t) => (
                      <li key={t.id}>
                        <Badge tone="neutral">
                          {t.label} +{t.points}
                          {!t.required && " · optional"}
                        </Badge>
                      </li>
                    ))}
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

                  {c.status === "ended" && (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      action={setCampaignStatus.bind(null, c.id, "live")}
                    >
                      Re-open
                    </ActionButton>
                  )}

                  <Button size="sm" variant="ghost" asChild className="ml-auto">
                    <a
                      href={c.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Reel
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
