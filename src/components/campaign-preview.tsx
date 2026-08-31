"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Eye, Upload, X } from "lucide-react";

import { CampaignCard } from "@/components/campaign-card";
import { TASK_META } from "@/components/task-meta";
import { Button } from "@/components/ui/button";
import { CardBody } from "@/components/ui/card";
import { Note } from "@/components/ui/feedback";
import { cn, timeRemaining } from "@/lib/utils";
import type { Enums } from "@/lib/database.types";

export type PreviewTask = {
  id: string;
  label: string;
  instructions: string | null;
  required: boolean;
  type: Enums<"task_type"> | null;
};

/**
 * The campaign as an ambassador will read it, from the admin's side.
 *
 * The row markup is the dashboard's, deliberately duplicated rather than
 * approximated: the whole point of the button is to answer "what did we
 * actually ask them to do", and a tidied-up summary would answer a different
 * question. What is left out is only what cannot exist yet — the upload
 * dialog, a submission status, the platform links in the footer.
 */
export function CampaignPreviewDialog({
  campaign,
  tasks,
}: {
  campaign: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    ends_at: string | null;
  };
  tasks: PreviewTask[];
}) {
  const [open, setOpen] = React.useState(false);
  const ended = timeRemaining(campaign.ends_at) === "Ended";
  const isClip = campaign.title.includes("CLIP");

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="secondary">
          <Eye aria-hidden />
          Preview
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
        <Dialog.Content
          className={[
            "animate-rise fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto",
            "bg-canvas p-5 shadow-xl",
            "sm:top-1/2 sm:left-1/2 sm:bottom-auto sm:w-[min(42rem,calc(100vw-2rem))]",
            "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
          ].join(" ")}
        >
          <Dialog.Title className="pr-8 text-[16px] font-bold text-ink">
            Ambassador view
          </Dialog.Title>
          <Dialog.Close className="absolute top-5 right-5 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none sm:top-6 sm:right-6">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            The card as it appears on a dashboard, opened out. The upload
            buttons are for show here.
          </Dialog.Description>

          {campaign.status !== "live" && (
            <Note tone="warn" className="mt-3">
              {campaign.status === "draft"
                ? "This is a draft, so no ambassador can see it yet — this is how it will read once you press Publish."
                : `This campaign is ${campaign.status}, so it is no longer on any dashboard.`}
            </Note>
          )}

          <div className="mt-4">
            <CampaignCard
              id={`preview-${campaign.id}`}
              variant={isClip ? "clip" : "reel"}
              title={campaign.title}
              description={campaign.description}
              deadlineLabel={timeRemaining(campaign.ends_at)}
              ended={ended}
              taskCount={tasks.length}
              doneCount={0}
              defaultOpen
            >
              <CardBody className="px-6 pt-0 pb-6">
                <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {tasks.map((task) => {
                    const Icon = (task.type && TASK_META[task.type]?.icon) || Upload;

                    return (
                      <li key={task.id} className="flex items-center gap-4 p-4">
                        <div
                          className={cn(
                            "grid size-11 shrink-0 place-items-center rounded-xl",
                            isClip
                              ? "bg-brand-tint text-brand-strong"
                              : "bg-gray-100 text-gray-800",
                          )}
                        >
                          <Icon className="size-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[14px] font-extrabold text-ink">
                              {task.label}
                            </p>
                            {!task.required && (
                              <span className="text-[12px] font-medium text-ink-soft">
                                Optional
                              </span>
                            )}
                          </div>

                          {task.instructions && (
                            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                              {task.instructions}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0">
                          <Button size="sm" variant="outline-blue" disabled>
                            <Upload aria-hidden />
                            Upload
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {tasks.length === 0 && (
                  <p className="text-[13px] text-ink-soft">
                    No tasks on this campaign yet, so an ambassador would open
                    it to an empty card.
                  </p>
                )}
              </CardBody>
            </CampaignCard>
          </div>

          <div className="mt-4 flex justify-end">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Close
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
