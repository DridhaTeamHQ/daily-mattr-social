"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import { updateCampaign, updateSurvey } from "@/lib/admin/edit-actions";

const PANEL = [
  "animate-rise fixed z-50 bg-surface shadow-pop",
  "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-lg p-5",
  "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md",
  "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
].join(" ");

function Overlay() {
  return (
    <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
  );
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`, not an ISO string with a zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CampaignEditDialog({
  campaign,
}: {
  campaign: {
    id: string;
    title: string;
    description: string | null;
    caption_hint: string | null;
    ends_at: string | null;
    status: string;
  };
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const live = campaign.status === "live";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="secondary">
          Edit
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className={PANEL}>
          <Dialog.Title className="text-[16px] font-bold text-ink">
            Edit campaign
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            Wording and deadline. Tasks and points are fixed once a campaign
            exists.
          </Dialog.Description>

          {live && (
            <Note tone="warn" className="mt-3">
              This campaign is live. Students see these changes immediately, so
              anything that changes what you are asking for needs a new
              campaign rather than an edit.
            </Note>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startTransition(async () => {
                const result = await updateCampaign(campaign.id, formData);
                if (result.ok) {
                  toast.success(result.message);
                  setOpen(false);
                } else {
                  toast.error(result.message);
                }
              });
            }}
            className="mt-4 space-y-4"
          >
            <Field label="Title" htmlFor="c-title" required>
              <Input
                id="c-title"
                name="title"
                defaultValue={campaign.title}
                required
                autoFocus
              />
            </Field>

            <Field label="Description" htmlFor="c-description">
              <Textarea
                id="c-description"
                name="description"
                rows={3}
                defaultValue={campaign.description ?? ""}
              />
            </Field>

            <Field label="Caption hint" htmlFor="c-caption">
              <Input
                id="c-caption"
                name="caption_hint"
                defaultValue={campaign.caption_hint ?? ""}
                placeholder="Optional"
              />
            </Field>

            <Field label="Ends at" htmlFor="c-ends">
              <Input
                id="c-ends"
                name="ends_at"
                type="datetime-local"
                defaultValue={toLocalInput(campaign.ends_at)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={pending}>
                Save
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SurveyEditDialog({
  survey,
  responseCount,
}: {
  survey: {
    id: string;
    title: string;
    description: string | null;
    response_cap: number | null;
  };
  responseCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="secondary">
          Edit
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className={PANEL}>
          <Dialog.Title className="text-[16px] font-bold text-ink">
            Edit survey
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            Title, description and the response cap. Questions are fixed once
            anyone has answered — editing a prompt would leave stored answers
            pointing at wording nobody was shown.
          </Dialog.Description>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startTransition(async () => {
                const result = await updateSurvey(survey.id, formData);
                if (result.ok) {
                  toast.success(result.message);
                  setOpen(false);
                } else {
                  toast.error(result.message);
                }
              });
            }}
            className="mt-4 space-y-4"
          >
            <Field label="Title" htmlFor="s-title" required>
              <Input
                id="s-title"
                name="title"
                defaultValue={survey.title}
                required
                autoFocus
              />
            </Field>

            <Field label="Description" htmlFor="s-description">
              <Textarea
                id="s-description"
                name="description"
                rows={3}
                defaultValue={survey.description ?? ""}
              />
            </Field>

            <Field label="Response cap" htmlFor="s-cap">
              <Input
                id="s-cap"
                name="response_cap"
                type="number"
                min={1}
                defaultValue={survey.response_cap ?? ""}
                placeholder="No limit"
              />
              <p className="mt-1.5 text-[12px] font-semibold text-ink-soft">
                {responseCount} collected so far. Leave blank for no limit.
              </p>
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={pending}>
                Save
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
