"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { createCampaign } from "@/lib/admin/actions";

const TASKS = [
  { type: "like", label: "Like", suggested: 10 },
  { type: "comment", label: "Comment", suggested: 20 },
  { type: "share", label: "Share", suggested: 15 },
  { type: "story", label: "Story", suggested: 30 },
] as const;

export function CreateCampaignDialog() {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

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

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Title" htmlFor="title" required>
              <Input
                id="title"
                name="title"
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
                defaultValue="dailymattr"
              />
            </Field>

            <fieldset>
              <legend className="mb-1.5 block text-[13px] font-medium text-ink">
                Tasks and points
              </legend>
              <p className="mb-2.5 text-[12.5px] text-ink-soft">
                Set a value above zero for each task you want. Leave a task at
                zero to leave it out.
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                {TASKS.map((task) => (
                  <label
                    key={task.type}
                    className="flex items-center gap-2 rounded-sm border border-line bg-canvas-sunk px-3 py-2"
                  >
                    <span className="flex-1 text-[13px] text-ink">
                      {task.label}
                    </span>
                    <Input
                      name={`points_${task.type}`}
                      type="number"
                      min={0}
                      max={1000}
                      step={1}
                      defaultValue={task.suggested}
                      className="h-8 w-20 text-right"
                      aria-label={`${task.label} points`}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

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
