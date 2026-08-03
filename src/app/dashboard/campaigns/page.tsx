import { redirect } from "next/navigation";
import {
  Clapperboard,
  ExternalLink,
  Heart,
  MessageCircle,
  Play,
  Share2,
  Upload,
} from "lucide-react";

import { Badge, StatusBadge, SUBMISSION_STATUS } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { getCampaigns } from "@/lib/queries";
import { timeRemaining } from "@/lib/utils";
import type { Enums } from "@/lib/database.types";

export const metadata = { title: "Campaigns" };

const TASK_META: Record<
  Enums<"task_type">,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  like: { label: "Like the reel", icon: Heart },
  comment: { label: "Leave a comment", icon: MessageCircle },
  share: { label: "Share it", icon: Share2 },
  story: { label: "Post to your story", icon: Play },
};

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();
  if (!campaigns) redirect("/login");

  if (campaigns.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Clapperboard}
          title="No live campaigns"
          description="When the team publishes a reel, it shows up here with the tasks you can complete."
        />
      </Card>
    );
  }

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={Clapperboard}
        tone="reel"
        title="Campaigns"
        description="Complete the tasks on a reel, then upload a screenshot as proof."
      />

      {campaigns.map((c) => {
        const ended = timeRemaining(c.ends_at) === "Ended";

        return (
          <Card key={c.id} id={c.id} className="scroll-mt-20">
            <CardBody>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="display text-[19px] text-ink">{c.title}</h2>
                <Badge tone={ended ? "neutral" : "reel"}>
                  {timeRemaining(c.ends_at)}
                </Badge>
              </div>

              {c.description && (
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                  {c.description}
                </p>
              )}

              <ul className="brut mt-4 divide-y-[3px] divide-ink overflow-hidden rounded-sm">
                {c.tasks.map((t) => {
                  const meta = TASK_META[t.type];
                  const Icon = meta.icon;
                  const help = t.submission_status
                    ? SUBMISSION_STATUS[t.submission_status]?.help
                    : null;

                  return (
                    <li key={t.id} className="flex items-start gap-3 p-3.5">
                      <div className="brut-sm mt-0.5 grid size-9 shrink-0 place-items-center rounded-sm bg-reel-tint">
                        <Icon className="size-4.5 text-ink" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[14px] font-extrabold text-ink">
                            {meta.label}
                          </p>
                          <span className="brut-sm tabular rounded-full bg-brand px-2 py-0.5 text-[12px] font-extrabold text-ink">
                            +{t.points}
                          </span>
                          {!t.required && (
                            <span className="text-[12px] text-ink-faint">
                              Optional
                            </span>
                          )}
                        </div>

                        {t.instructions && (
                          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                            {t.instructions}
                          </p>
                        )}

                        {help && (
                          <p className="mt-1.5 text-[12px] text-ink-soft">
                            {help}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0">
                        {t.submission_status ? (
                          <StatusBadge status={t.submission_status} />
                        ) : (
                          <Button size="sm" variant="quiet" disabled={ended}>
                            <Upload aria-hidden />
                            Upload
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>

            <CardFooter className="flex items-center justify-between gap-3">
              <p className="text-[12.5px] text-ink-soft">
                Open the reel, complete the task, then upload your screenshot.
              </p>
              <Button size="sm" variant="secondary" asChild>
                <a href={c.instagram_url} target="_blank" rel="noopener noreferrer">
                  Open reel
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
