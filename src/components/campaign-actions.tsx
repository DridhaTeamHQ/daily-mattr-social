"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { SOCIAL_PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { createCampaign } from "@/lib/admin/actions";
import { draftCampaign } from "@/lib/admin/ai-actions";

const TASKS = [
  { type: "like", label: "Like", suggested: 10, tag: "Daily" },
  { type: "comment", label: "Comment", suggested: 20, tag: "Daily" },
  { type: "share", label: "Share", suggested: 15, tag: "Twice weekly" },
  { type: "story", label: "Story", suggested: 30, tag: "Weekly" },
] as const;

export function CreateCampaignDialog({ aiEnabled }: { aiEnabled: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const [brief, setBrief] = React.useState("");
  const [drafting, startDrafting] = React.useTransition();
  const [commentIdeas, setCommentIdeas] = React.useState<string[]>([]);

  // Controlled so an AI draft can fill them; the form still posts normally.
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [handle, setHandle] = React.useState("dailymattr");
  const [points, setPoints] = React.useState<Record<string, number>>({
    like: 10,
    comment: 20,
    share: 15,
    story: 30,
  });

  function draft() {
    startDrafting(async () => {
      const result = await draftCampaign(brief);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      const drafted = result.data;
      setTitle(drafted.title);
      setDescription(drafted.description);
      setPoints({
        like: drafted.points.like,
        comment: drafted.points.comment,
        share: drafted.points.share,
        story: drafted.points.story,
      });
      setCommentIdeas(drafted.comment_ideas ?? []);
      toast.success("Draft ready — edit anything before creating.");
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createCampaign(formData);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>New campaign</Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
        <Dialog.Content
          className={[
            "animate-rise fixed z-50 bg-surface shadow-pop",
            "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-lg p-5",
            "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg",
            "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
          ].join(" ")}
        >
          <Dialog.Title className="text-[16px] font-semibold text-ink">
            New campaign
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            Created as a draft. Nothing reaches ambassadors until you publish
            it.
          </Dialog.Description>

          {aiEnabled && (
            <div className="mt-4 rounded-sm border border-rank-line bg-rank-tint/40 p-3.5">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                <Sparkles className="size-4 text-rank" />
                Draft it with AI
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-soft">
                Describe the post and what you want out of it.
              </p>

              <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Reel about our exam-week study playlist"
                  onKeyDown={(e) => {
                    // Enter here would otherwise submit the campaign form.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (brief.trim()) draft();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  loading={drafting}
                  disabled={!brief.trim()}
                  onClick={draft}
                  className="shrink-0"
                >
                  Draft
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Title" htmlFor="title" required>
              <Input
                id="title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Monsoon reel — share it everywhere"
                required
                autoFocus
              />
            </Field>

            <Field label="Instagram URL" htmlFor="instagram_url" required>
              <Input
                id="instagram_url"
                name="instagram_url"
                type="url"
                placeholder="https://www.instagram.com/reel/…"
                required
              />
            </Field>

            <Field
              label="Description"
              htmlFor="description"
              hint="What students see on the campaign card."
            >
              <Textarea
                id="description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Like it, drop a genuine comment, and put it on your story."
              />
            </Field>

            <Field
              label="Expected handle"
              htmlFor="expected_handle"
              hint="The handle the screenshot must show. Stored without the @."
            >
              <Input
                id="expected_handle"
                name="expected_handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
            </Field>

            <Field label="Social network" htmlFor="platform">
              <select
                id="platform"
                name="platform"
                defaultValue="Instagram"
                className="h-11 w-full rounded-lg border border-gray-200 bg-surface px-3 text-[14px] font-semibold text-ink focus:border-brand focus:outline-none"
              >
                {SOCIAL_PLATFORMS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <fieldset>
              <legend className="mb-1.5 block text-[13px] font-medium text-ink">
                Tasks and points
              </legend>
              <p className="mb-2.5 text-[12.5px] text-ink-soft">
                Set a value above zero for each task you want. Leave a task at
                zero to leave it out.
              </p>

              <div className="space-y-2.5">
                {TASKS.map((task) => {
                  const value = points[task.type] ?? task.suggested;
                  const included = value > 0;

                  return (
                    <div
                      key={task.type}
                      className={cn(
                        "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors",
                        included
                          ? "border-brand/35 bg-brand-tint/40"
                          : "border-gray-200 bg-gray-50",
                      )}
                    >
                      <span className="text-[13.5px] font-bold text-ink">
                        {task.label}
                      </span>
                      <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-bold text-ink-soft">
                        {task.tag}
                      </span>

                      {/* Says out loud what zero means, rather than leaving the
                          admin to infer it from the helper text above. */}
                      <span
                        className={cn(
                          "text-[11.5px] font-bold",
                          included ? "text-brand-strong" : "text-ink-faint",
                        )}
                      >
                        {included ? "included" : "left out"}
                      </span>

                      <Stepper
                        name={`points_${task.type}`}
                        label={`${task.label} points`}
                        value={value}
                        min={0}
                        max={1000}
                        step={5}
                        onChange={(next) =>
                          setPoints((p) => ({ ...p, [task.type]: next }))
                        }
                        className="ml-auto"
                      />
                    </div>
                  );
                })}
              </div>
            </fieldset>

            {commentIdeas.length > 0 && (
              <div className="rounded-sm border border-line bg-canvas-sunk p-3.5">
                <p className="text-[13px] font-bold text-ink">
                  Comment ideas for students
                </p>
                <p className="mt-0.5 text-[12px] text-ink-soft">
                  Not saved with the campaign — paste them into your group chat
                  so nobody posts the same thing.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {commentIdeas.map((idea) => (
                    <li
                      key={idea}
                      className="rounded-xs bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-soft"
                    >
                      {idea}
                    </li>
                  ))}
                </ul>
                <CopyButton
                  value={commentIdeas.join("\n")}
                  size="sm"
                  variant="secondary"
                  className="mt-2.5"
                  label="Copy ideas"
                  toastMessage="Comment ideas copied"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={pending}>
                Create draft
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
