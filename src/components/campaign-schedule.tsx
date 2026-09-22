"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { toast } from "sonner";
import { CalendarClock, X } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import {
  cancelCampaignSchedule,
  scheduleCampaignPublish,
} from "@/lib/admin/actions";
import { cn } from "@/lib/utils";

/**
 * Setting the hour a draft goes live, instead of being awake for it.
 *
 * Sits next to Publish rather than inside the edit dialog, because it is the
 * same decision as Publish — when does the cohort meet this — and burying it
 * three fields down a form full of wording changes would hide it from the one
 * moment anybody wants it: the second before they would otherwise have pressed
 * the button and gone to bed.
 */

/** A store that never emits — `publishAt` changes by prop, not by event. */
const NEVER_CHANGES = () => () => {};

const PANEL = [
  "animate-rise fixed z-50 bg-surface shadow-pop",
  "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto no-scrollbar rounded-t-lg p-5",
  "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md",
  "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
].join(" ");

/**
 * The campaign's scheduled launch as the two fields that edit it.
 *
 * Two inputs rather than one `datetime-local`, for the reason the deadline
 * fields give: the combined picker opens a calendar and a clock over the
 * middle of the dialog, covering the button that would save what you picked.
 */
function toLocalInput(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Today in the browser's zone, as the `min` a date input understands. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CampaignScheduleDialog({
  campaign,
  className,
}: {
  campaign: {
    id: string;
    title: string;
    publish_at: string | null;
    ends_at: string | null;
  };
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const scheduled = Boolean(campaign.publish_at);
  const current = toLocalInput(campaign.publish_at);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="secondary" className={cn(className)}>
          <CalendarClock aria-hidden />
          {scheduled ? "Reschedule" : "Schedule"}
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
        <Dialog.Content className={PANEL}>
          <Dialog.Title className="text-[16px] font-bold text-ink pr-8">
            Schedule publish
          </Dialog.Title>
          <Dialog.Close className="absolute right-5 top-5 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:right-6 sm:top-6">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            It stays a draft until the time you set, then goes live by itself —
            the same as pressing Publish, including the notification every
            active ambassador gets.
          </Dialog.Description>

          {campaign.ends_at && (
            <Note tone="neutral" className="mt-3">
              This campaign ends{" "}
              {new Date(campaign.ends_at).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
              . Publishing has to be before that.
            </Note>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              // The admin's clock, not the server's — on Vercel the server
              // runs in UTC, so a 9am launch set from India would land at
              // half past two in the afternoon.
              formData.set("tz_offset", String(new Date().getTimezoneOffset()));

              startTransition(async () => {
                const result = await scheduleCampaignPublish(
                  campaign.id,
                  formData,
                );
                if (!result.ok) {
                  toast.error(result.message);
                  return;
                }
                toast.success(result.message);
                setOpen(false);
              });
            }}
            className="mt-4 space-y-4"
          >
            <Field label="Goes live" htmlFor="c-publish-date" required>
              <div className="grid grid-cols-[1fr_9rem] gap-2">
                <Input
                  id="c-publish-date"
                  name="publish_date"
                  type="date"
                  // The past is never a valid answer here, so the picker
                  // refuses it before the action has to.
                  min={today()}
                  defaultValue={current.date}
                  required
                  autoFocus
                />
                <Input
                  id="c-publish-time"
                  name="publish_time"
                  type="time"
                  aria-label="Goes live, time"
                  defaultValue={current.time}
                />
              </div>
              <p className="mt-1.5 text-[12px] text-ink-soft">
                A date on its own publishes at 9:00 AM that day. Times are read
                in your own timezone.
              </p>
            </Field>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {/* Cancelling is offered here rather than as a fifth button on
                  an already crowded card footer — you come to this dialog to
                  change when it launches, and "not at all" is one of the
                  answers to that. */}
              {scheduled && (
                <ActionButton
                  variant="ghost"
                  className="mr-auto"
                  action={cancelCampaignSchedule.bind(null, campaign.id)}
                  onSuccess={() => setOpen(false)}
                >
                  Cancel schedule
                </ActionButton>
              )}
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Close
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={pending}>
                {scheduled ? "Reschedule" : "Schedule"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * What a scheduled draft says about itself on a card.
 *
 * A draft that is scheduled and a draft that is not look identical otherwise,
 * and the difference is the whole thing an admin came to the list to check.
 * Replaces the "press Publish" warning rather than sitting next to it: that
 * line is a prompt to act, and on a campaign that is already going to publish
 * itself it is a lie.
 */
export function ScheduledNote({ publishAt }: { publishAt: string }) {
  /**
   * Formatted on the client, because the admin's timezone is the only one
   * this sentence is true in — the server runs in UTC on Vercel and would
   * render a 9am launch as "3:30 AM".
   *
   * `useSyncExternalStore` rather than an effect that sets state: this is
   * exactly the "a value differs between server and client" case it exists
   * for, and it gets the local string in on hydration instead of on a second
   * render the user can see flicker through.
   */
  const when = React.useSyncExternalStore(
    NEVER_CHANGES,
    () =>
      new Date(publishAt).toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
    // The server has no local zone worth printing, so it prints nothing and
    // the fallback sentence below stands in until hydration.
    () => null,
  );

  return (
    <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft">
      <CalendarClock aria-hidden className="size-3.5 shrink-0" />
      {when ? `Publishes ${when} — no need to be here.` : "Publish scheduled."}
    </p>
  );
}
