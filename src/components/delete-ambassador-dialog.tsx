"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import { DialogOpener } from "@/components/dialog-opener";
import { deleteAmbassador, deleteAmbassadors } from "@/lib/admin/actions";

/**
 * Permanently delete an ambassador.
 *
 * From the ambassador's own page; the list deletes by ticking rows instead.
 * Typing their referral code is the confirmation. A plain "Are you sure?" gets
 * clicked through; the code is short, shown in the header above, and is
 * different for every person.
 */
export function DeleteAmbassadorDialog({
  profileId,
  name,
  referralCode,
  redirectTo,
}: {
  profileId: string;
  name: string;
  referralCode: string;
  /** Where to go afterwards — their own page no longer exists once it's done. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const matches = typed.trim().toUpperCase() === referralCode.toUpperCase();

  function onOpenChange(next: boolean) {
    if (!next) setTyped("");
    setOpen(next);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!matches) return;

    startTransition(async () => {
      const result = await deleteAmbassador(profileId);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {/* Not `Dialog.Trigger asChild`: see DialogOpener. */}
      <DialogOpener onOpen={() => setOpen(true)}>
        <Button
          variant="secondary"
          size="sm"
          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 aria-hidden />
          Delete
        </Button>
      </DialogOpener>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
        <Dialog.Content
          className={[
            "animate-rise fixed z-50 bg-surface shadow-pop",
            "inset-x-0 bottom-0 rounded-t-lg p-5",
            "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md",
            "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
          ].join(" ")}
        >
          <Dialog.Title className="text-[16px] font-semibold text-ink">
            Delete {name}?
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            Their login, points, downloads, submissions and payouts are deleted
            for good. To keep their history for 30 days instead, suspend them.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Note tone="warn">This can&apos;t be undone.</Note>

            <Field
              label={`Type ${referralCode} to confirm`}
              htmlFor={`delete-${profileId}`}
            >
              <Input
                id={`delete-${profileId}`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={referralCode}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                autoFocus
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
                variant="danger"
                loading={pending}
                disabled={!matches}
              >
                Delete for good
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Matches MAX_DELETE_PER_CALL in actions.ts. */
const CHUNK = 25;

/**
 * Permanently delete everybody ticked on the ambassadors table.
 *
 * Typing DELETE is the confirmation — there are too many codes to type, and a
 * word that has to be spelled out is still harder to click through than a
 * button. A long selection goes in chunks with progress on the button, so a
 * hundred people is four calls rather than one that times out halfway.
 */
export function DeleteAmbassadorsDialog({
  ids,
  onDone,
}: {
  ids: string[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [progress, setProgress] = React.useState<number | null>(null);

  const count = ids.length;
  const who = `${count} ${count === 1 ? "ambassador" : "ambassadors"}`;
  const matches = typed.trim().toUpperCase() === "DELETE";
  const busy = progress !== null;

  function onOpenChange(next: boolean) {
    if (busy) return;
    if (!next) setTyped("");
    setOpen(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!matches || busy) return;

    let deleted = 0;
    let failed = 0;
    setProgress(0);
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const result = await deleteAmbassadors(ids.slice(i, i + CHUNK));
        deleted += result.deleted;
        failed += result.failed;
        if (!result.ok && result.deleted === 0 && result.failed === 0) {
          // Refused outright (not an admin, read-only run…): stop here.
          toast.error(result.message);
          return;
        }
        setProgress(deleted + failed);
      }
      if (failed) toast.error(`Deleted ${deleted} · ${failed} couldn't be deleted`);
      else toast.success(`Deleted ${deleted} for good`);
      setOpen(false);
      setTyped("");
      onDone?.();
    } catch {
      toast.error(`Stopped after ${deleted}. Try the rest again.`);
    } finally {
      setProgress(null);
      router.refresh();
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogOpener onOpen={() => setOpen(true)}>
        <Button size="sm" variant="danger">
          <Trash2 aria-hidden />
          Delete {count}
        </Button>
      </DialogOpener>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
        <Dialog.Content
          className={[
            "animate-rise fixed z-50 bg-surface shadow-pop",
            "inset-x-0 bottom-0 rounded-t-lg p-5",
            "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md",
            "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
          ].join(" ")}
        >
          <Dialog.Title className="text-[16px] font-semibold text-ink">
            Delete {who}?
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            Their logins, points, downloads, submissions and payouts are deleted
            for good. Their referral codes are offered to the next people you
            add. To keep their history for 30 days instead, suspend them.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Note tone="warn">This can&apos;t be undone.</Note>

            <Field label="Type DELETE to confirm" htmlFor="delete-many">
              <Input
                id="delete-many"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="DELETE"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={busy}
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary" disabled={busy}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                variant="danger"
                loading={busy}
                disabled={!matches}
              >
                {busy ? `Deleting ${progress} of ${count}` : `Delete ${count} for good`}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
