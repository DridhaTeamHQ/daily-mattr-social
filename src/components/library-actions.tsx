"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { createLibraryTask } from "@/lib/admin/library-actions";

const PANEL = [
  "animate-rise fixed z-50 bg-surface shadow-pop",
  "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-lg p-5",
  "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md",
  "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
].join(" ");

const PROOF_OPTIONS = [
  { value: "screenshot", label: "Screenshot" },
  { value: "link", label: "A link they paste" },
  { value: "text", label: "A written answer" },
  { value: "none", label: "No proof needed" },
];

const CADENCE_OPTIONS = [
  { value: "once", label: "One-off" },
  { value: "daily", label: "Daily" },
  { value: "twice_weekly", label: "Twice weekly" },
  { value: "weekly", label: "Weekly" },
  { value: "milestone", label: "Milestone" },
];

/** Matches the shared Input styling so a native select doesn't look imported. */
const SELECT =
  "h-11 w-full rounded-lg border border-gray-200 bg-surface px-3 text-[14px] font-semibold text-ink focus:border-brand focus:outline-none";

export function LibraryTaskDialog() {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createLibraryTask(formData);
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
        <Button>Add a task</Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
        <Dialog.Content className={PANEL}>
          <Dialog.Title className="text-[16px] font-bold text-ink">
            Add a task to the library
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            Reusable across campaigns with a consistent proof method and cadence.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Name" htmlFor="label" required>
              <Input
                id="label"
                name="label"
                required
                autoFocus
                placeholder="Post on LinkedIn"
              />
            </Field>

            <Field label="Platform" htmlFor="platform">
              <Input id="platform" name="platform" placeholder="LinkedIn" />
            </Field>

            <Field label="Instructions" htmlFor="instructions">
              <Textarea
                id="instructions"
                name="instructions"
                rows={3}
                placeholder="Post about dailymattr and paste the post URL."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Proof" htmlFor="proof_type">
                <select id="proof_type" name="proof_type" className={SELECT} defaultValue="screenshot">
                  {PROOF_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Cadence" htmlFor="cadence">
                <select id="cadence" name="cadence" className={SELECT} defaultValue="once">
                  {CADENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <input type="hidden" name="default_points" value="0" />

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={pending}>
                Add to library
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
