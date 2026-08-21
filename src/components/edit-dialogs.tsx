"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import { updateCampaignTasks } from "@/lib/admin/campaign-tasks";
import { updateCampaign, updateSurvey } from "@/lib/admin/edit-actions";
import { SOCIAL_PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

const PANEL = [
  "animate-rise fixed z-50 bg-surface shadow-pop",
  "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto no-scrollbar rounded-t-lg p-5",
  "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full",
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

export type EditableTask = {
  id: string;
  /** What the task is called today, library fallback already applied. */
  label: string;
  label_override: string | null;
  points: number;
  required: boolean;
  instructions: string | null;
  /** Submissions of any status against this task. */
  submitted: number;
};

export function CampaignEditDialog({
  campaign,
  tasks,
}: {
  campaign: {
    id: string;
    title: string;
    description: string | null;
    caption_hint: string | null;
    ends_at: string | null;
    status: string;
    platform: string;
  };
  /**
   * The campaign's tasks, editable in the same save. Omit to get the
   * wording-only dialog — the campaign page passes nothing, because it has a
   * task manager of its own directly below that also adds and removes.
   */
  tasks?: EditableTask[];
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const live = campaign.status === "live";
  const editableTasks = tasks ?? [];
  const withTasks = editableTasks.length > 0;
  const worked = editableTasks.filter((task) => task.submitted > 0).length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="secondary">
          Edit
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className={cn(PANEL, withTasks ? "sm:max-w-2xl" : "sm:max-w-md")}>
          <Dialog.Title className="text-[16px] font-bold text-ink pr-8">
            Edit {withTasks ? "task" : "campaign"}
          </Dialog.Title>
          <Dialog.Close className="absolute right-5 top-5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none sm:right-6 sm:top-6">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            {withTasks
              ? "Wording, network and deadline, plus every task on this campaign — including which ones are required. Adding and removing tasks happens on the campaign page."
              : "Wording, network and deadline. Tasks are managed on the campaign page below."}
          </Dialog.Description>

          {live && (
            <Note tone="warn" className="mt-3">
              This campaign is live, so students see these changes
              immediately.
            </Note>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startTransition(async () => {
                // The campaign first: if its title is rejected, nothing has
                // been written yet and the form is still exactly what the
                // admin typed.
                const result = await updateCampaign(campaign.id, formData);
                if (!result.ok) {
                  toast.error(result.message);
                  return;
                }

                if (withTasks) {
                  const taskResult = await updateCampaignTasks(
                    campaign.id,
                    formData,
                  );
                  if (!taskResult.ok) {
                    // Said plainly rather than swallowed: the campaign half
                    // did save, and closing on a green toast would hide that
                    // the tasks did not.
                    toast.error(`Campaign saved, but the tasks were not: ${taskResult.message}`);
                    return;
                  }
                }

                toast.success(result.message);
                setOpen(false);
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

            <Field label="Social network" htmlFor="c-platform">
              <select
                id="c-platform"
                name="platform"
                defaultValue={campaign.platform}
                className="h-11 w-full rounded-lg border border-gray-200 bg-surface px-3 text-[14px] font-semibold text-ink focus:border-brand focus:outline-none"
              >
                {SOCIAL_PLATFORMS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ends at" htmlFor="c-ends">
              <Input
                id="c-ends"
                name="ends_at"
                type="datetime-local"
                defaultValue={toLocalInput(campaign.ends_at)}
              />
            </Field>

            {withTasks && (
              <div className="border-t-[3px] border-ink pt-4">
                <h3 className="text-[13px] font-extrabold tracking-wide text-ink uppercase">
                  Tasks
                </h3>
                <p className="mt-1 text-[12.5px] text-ink-soft">
                  Unticking <strong className="font-bold text-ink">Required</strong> leaves
                  the task on the dashboard but stops it counting towards
                  finishing the campaign. Points already paid out are never
                  clawed back — a new figure only applies to approvals from
                  here on.
                </p>

                {worked > 0 && (
                  <Note tone="warn" className="mt-3">
                    {worked === 1
                      ? "One task already has submissions against it."
                      : `${worked} tasks already have submissions against them.`}{" "}
                    Changing what they ask for changes the deal midway through.
                  </Note>
                )}

                <ul className="mt-3 space-y-3">
                  {editableTasks.map((task) => (
                    <li
                      key={task.id}
                      className="rounded-lg border-[3px] border-ink bg-canvas-sunk p-3.5"
                    >
                      {/* The id list is what tells the action which tasks were
                          on the form, because an unticked box sends nothing. */}
                      <input type="hidden" name="task_id" value={task.id} />

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <label className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
                          <input
                            type="checkbox"
                            name={`required:${task.id}`}
                            defaultChecked={task.required}
                            className="size-4"
                          />
                          Required
                        </label>

                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold text-ink">
                          {task.label}
                        </span>

                        <span className="tabular shrink-0 text-[12px] font-bold text-ink-soft">
                          {task.submitted} submission
                          {task.submitted === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_7rem]">
                        <Field label="Rename it" htmlFor={`t-label-${task.id}`}>
                          <Input
                            id={`t-label-${task.id}`}
                            name={`label:${task.id}`}
                            // The override, not the displayed label. Seeding
                            // this with the library's own wording would write
                            // that wording into the override on the next save
                            // and quietly sever the task from its library row.
                            defaultValue={task.label_override ?? ""}
                            placeholder={task.label}
                            className="h-10 text-[13.5px]"
                          />
                        </Field>

                        <Field label="Points" htmlFor={`t-points-${task.id}`}>
                          <Input
                            id={`t-points-${task.id}`}
                            name={`points:${task.id}`}
                            type="number"
                            min={0}
                            max={10000}
                            step={1}
                            defaultValue={task.points}
                            className="h-10 text-[13.5px]"
                          />
                        </Field>
                      </div>

                      <Field
                        label="Instructions"
                        htmlFor={`t-instructions-${task.id}`}
                        className="mt-3"
                      >
                        <Input
                          id={`t-instructions-${task.id}`}
                          name={`instructions:${task.id}`}
                          defaultValue={task.instructions ?? ""}
                          placeholder="Optional — what exactly to do"
                          className="h-10 text-[13.5px]"
                        />
                      </Field>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
          <Dialog.Title className="text-[16px] font-bold text-ink pr-8">
            Edit survey
          </Dialog.Title>
          <Dialog.Close className="absolute right-5 top-5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none sm:right-6 sm:top-6">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
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
