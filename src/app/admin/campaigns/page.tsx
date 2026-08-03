import { Clapperboard, ExternalLink } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { CreateCampaignDialog } from "@/components/campaign-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { setCampaignStatus } from "@/lib/admin/actions";
import { getAdminCampaigns } from "@/lib/admin/queries";
import { formatDate, timeRemaining } from "@/lib/utils";

export const metadata = { title: "Campaigns" };

const STATUS_TONE = { live: "ok", draft: "neutral", ended: "neutral" } as const;

const TASK_LABEL: Record<string, string> = {
  like: "Like",
  comment: "Comment",
  share: "Share",
  story: "Story",
};

export default async function AdminCampaignsPage() {
  const campaigns = await getAdminCampaigns();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Campaigns
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Only live campaigns appear on ambassador dashboards.
          </p>
        </div>

        <CreateCampaignDialog />
      </div>

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
                    <h2 className="text-[15px] font-semibold text-ink">
                      {c.title}
                    </h2>
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

                  <ul className="mt-3.5 flex flex-wrap gap-1.5">
                    {c.tasks.map((t) => (
                      <li key={t.id}>
                        <Badge tone="neutral">
                          {TASK_LABEL[t.type] ?? t.type} +{t.points}
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
