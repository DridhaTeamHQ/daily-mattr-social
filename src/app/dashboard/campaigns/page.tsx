import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Clapperboard,
  ExternalLink,
  Heart,
  MessageCircle,
  Play,
  Share2,
  Megaphone,
  Video,
  Sparkles,
} from "lucide-react";

import { Badge, StatusBadge, SUBMISSION_STATUS } from "@/components/ui/badge";
import { UploadTask } from "@/components/upload-task";
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
        const expectedHandle = c.expected_handle;

        return (
          <Card key={c.id} id={c.id} className="scroll-mt-20">
            <CardBody className="p-6">
              <div className="flex items-start gap-4">
                <div className={cn("grid size-12 shrink-0 place-items-center rounded-xl", c.title.includes("CLIP") ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-800")}>
                  {c.title.includes("CLIP") ? <Video className="size-6" /> : <Megaphone className="size-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16px] font-extrabold uppercase tracking-wide text-ink">{c.title}</h2>
                    <Badge tone={ended ? "neutral" : "reel"}>
                      {timeRemaining(c.ends_at)}
                    </Badge>
                  </div>
                  {c.description && (
                    <p className="mt-1.5 text-[13.5px] leading-relaxed font-medium text-ink-soft">
                      {c.description}
                    </p>
                  )}
                </div>
              </div>

              <ul className="mt-5 divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
                {c.tasks.map((t) => {
                  const meta = TASK_META[t.type];
                  const Icon = meta.icon;
                  const help = t.submission_status
                    ? SUBMISSION_STATUS[t.submission_status]?.help
                    : null;

                  return (
                    <li key={t.id} className="flex items-center gap-4 p-4">
                      <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", c.title.includes("CLIP") ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-800")}>
                        <Icon className="size-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[14px] font-extrabold text-ink">
                            {meta.label}
                          </p>
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[12px] font-extrabold text-gray-800">
                            +{t.points}
                          </span>
                          {!t.required && (
                            <span className="text-[12px] font-medium text-ink-soft">
                              Optional
                            </span>
                          )}
                        </div>

                        {t.instructions && (
                          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                            {t.instructions}
                          </p>
                        )}

                        {help && (
                          <p className="mt-1.5 text-[12px] font-medium text-ink-soft">
                            {help}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0">
                        {t.submission_status &&
                        t.submission_status !== "rejected" &&
                        t.submission_status !== "revoked" ? (
                          <StatusBadge status={t.submission_status} />
                        ) : (
                          <div className="flex flex-col items-end gap-1.5">
                            {t.submission_status && (
                              <StatusBadge status={t.submission_status} />
                            )}
                            <UploadTask
                              taskId={t.id}
                              taskLabel={meta.label}
                              points={t.points}
                              expectedHandle={expectedHandle}
                              disabled={ended}
                            />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>

            <CardFooter className={cn("flex items-center justify-between gap-3 px-6 py-4 border-t-0 rounded-b-xl", c.title.includes("CLIP") ? "bg-blue-50/50" : "bg-gray-50/50")}>
              <p className="text-[13px] font-medium text-ink-soft flex items-center gap-2">
                <Sparkles className={cn("size-4", c.title.includes("CLIP") ? "text-blue-600" : "text-gray-600")} />
                Open the reel, complete the task, then upload your screenshot.
              </p>
              <Button size="sm" className={cn("text-white border-0 shadow-sm transition-transform hover:scale-[1.02]", c.title.includes("CLIP") ? "bg-blue-600 hover:bg-blue-700" : "bg-black hover:bg-gray-800")} asChild>
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
