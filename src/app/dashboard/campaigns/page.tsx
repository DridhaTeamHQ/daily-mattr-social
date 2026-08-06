import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Clapperboard,
  ExternalLink,
  Heart,
  MessageCircle,
  Play,
  Share2,
  Sparkles,
  Upload,
} from "lucide-react";

import { CampaignCard } from "@/components/campaign-card";
import { StatusBadge, SUBMISSION_STATUS } from "@/components/ui/badge";
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
        description="Finish the challenge, submit your proof, and let the points roll in!"
      />

      {campaigns.map((c) => {
        const ended = timeRemaining(c.ends_at) === "Ended";
        const expectedHandle = c.expected_handle;
        const isClip = c.title.includes("CLIP");

        const credited = c.tasks.filter(
          (t) =>
            t.submission_status === "approved" ||
            t.submission_status === "auto_approved",
        );
        const doneCount = credited.length;

        // Two different numbers: what the campaign is worth in total, and what
        // has actually landed in the ledger. Only the second one may be called
        // "gained".
        const points = c.tasks.reduce((n, t) => n + t.points, 0);
        const earnedPoints = credited.reduce((n, t) => n + t.points, 0);

        return (
          <CampaignCard
            key={c.id}
            id={c.id}
            variant={isClip ? "clip" : "reel"}
            title={c.title}
            description={c.description}
            deadlineLabel={timeRemaining(c.ends_at)}
            ended={ended}
            taskCount={c.tasks.length}
            doneCount={doneCount}
            points={points}
            earnedPoints={earnedPoints}
          >
            <CardBody className="px-6 pt-0 pb-6">
              <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
                {c.tasks.map((t) => {
                  // A library task has no enum type, so fall back to its own
                  // label and a neutral icon rather than indexing with null.
                  const meta = t.type ? TASK_META[t.type] : undefined;
                  const Icon = meta?.icon ?? Upload;
                  const help = t.submission_status
                    ? SUBMISSION_STATUS[t.submission_status]?.help
                    : null;

                  return (
                    <li key={t.id} className="flex items-center gap-4 p-4">
                      <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", isClip ? "bg-brand-tint text-brand-strong" : "bg-gray-100 text-gray-800")}>
                        <Icon className="size-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[14px] font-extrabold text-ink">
                            {t.label}
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
                              taskLabel={t.label}
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

            <CardFooter className={cn("flex items-center justify-between gap-3 px-6 py-4 border-t-0 rounded-b-xl", isClip ? "bg-brand-tint/50" : "bg-gray-50/50")}>
              <p className="text-[13px] font-medium text-ink-soft flex items-center gap-2">
                <Sparkles className={cn("size-4", isClip ? "text-brand-strong" : "text-gray-600")} />
                Open the reel, complete the task, then upload your screenshot.
              </p>
              <Button size="sm" className={cn("text-white border-0 shadow-sm transition-transform hover:scale-[1.02]", isClip ? "bg-brand-strong hover:bg-brand-press" : "bg-black hover:bg-gray-800")} asChild>
                <a href={c.instagram_url} target="_blank" rel="noopener noreferrer">
                  Open reel
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            </CardFooter>
          </CampaignCard>
        );
      })}
    </div>
  );
}
