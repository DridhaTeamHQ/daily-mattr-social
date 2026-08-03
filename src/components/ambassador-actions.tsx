"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import { adjustPoints, inviteAmbassador } from "@/lib/admin/actions";

const PANEL = [
  "animate-rise fixed z-50 bg-surface shadow-pop",
  "inset-x-0 bottom-0 rounded-t-lg p-5",
  "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md",
  "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
].join(" ");

function Overlay() {
  return (
    <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
  );
}

/** Manual point grant or deduction. Always writes a ledger row, never edits. */
export function AdjustPointsDialog({
  profileId,
  name,
}: {
  profileId: string;
  name: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [delta, setDelta] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(delta);

    startTransition(async () => {
      const result = await adjustPoints(profileId, value, note);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        setDelta("");
        setNote("");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="sm">
          Adjust
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className={PANEL}>
          <Dialog.Title className="text-[16px] font-semibold text-ink">
            Adjust points
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            For {name}. Use a negative number to take points away — either way
            this is a new ledger row, so their history stays intact.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field
              label="Points"
              htmlFor="delta"
              hint="Whole number. Negative to deduct."
              required
            >
              <Input
                id="delta"
                type="number"
                inputMode="numeric"
                step="1"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="50"
                required
                autoFocus
              />
            </Field>

            <Field label="Reason" htmlFor="note" required>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ran the Christ University stall on Saturday."
                required
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                loading={pending}
                disabled={!delta.trim() || !note.trim()}
              >
                Record
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Invite by email. The profile row is created by the auth trigger. */
export function InviteDialog() {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await inviteAmbassador(formData);
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
        <Button>Invite ambassador</Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className={PANEL}>
          <Dialog.Title className="text-[16px] font-semibold text-ink">
            Invite an ambassador
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            They get an email with a link to set a password. Their referral code
            is generated automatically.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Full name" htmlFor="full_name" required>
              <Input id="full_name" name="full_name" required autoFocus />
            </Field>

            <Field label="Email" htmlFor="email" required>
              <Input id="email" name="email" type="email" required />
            </Field>

            <Field label="College" htmlFor="college">
              <Input id="college" name="college" placeholder="Optional" />
            </Field>

            <Note tone="neutral">
              Invite emails go through whatever SMTP the Supabase project is
              configured with. On the built-in service they are rate limited to
              a handful an hour.
            </Note>

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={pending}>
                Send invite
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
