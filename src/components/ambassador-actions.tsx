"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { CircleCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import {
  adjustPoints,
  createAmbassador,
  resetAmbassadorPassword,
  type CreatedAmbassador,
} from "@/lib/admin/actions";
import { publicEnv } from "@/lib/env";
import { BATCH_OPTIONS, CITY_OPTIONS } from "@/lib/batches";

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

/**
 * Readable temporary password.
 *
 * An admin reads this out or pastes it into WhatsApp, and the student types it
 * on a phone, so it avoids characters that are ambiguous in most fonts.
 */
function suggestPassword() {
  const words = ["campus", "mango", "monsoon", "rocket", "coffee", "puzzle", "orbit", "cricket"];
  const alphabet = "23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const word = words[bytes[0] % words.length];
  const digits = [...bytes.slice(1)].map((b) => alphabet[b % alphabet.length]).join("");
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}-${digits}`;
}

/** Shown after an account is made, so the admin can pass the details on. */
function CredentialsPanel({
  credentials,
  emailDelivery,
  onDone,
}: {
  credentials: NonNullable<CreatedAmbassador["credentials"]>;
  emailDelivery?: CreatedAmbassador["emailDelivery"];
  onDone: () => void;
}) {
  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/login` : "";
  const shareText = [
    `Hi ${credentials.fullName}, here's your DailyMattr login.`,
    "",
    `Email: ${credentials.email}`,
    `Temporary password: ${credentials.password}`,
    "",
    `Sign in at ${loginUrl} — you'll be asked to pick your own password straight away.`,
    publicEnv.appDownloadUrl
      ? `Download the app here: ${publicEnv.appDownloadUrl}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-sm bg-ok-tint text-ok">
          <CircleCheck className="size-5" />
        </span>
        <Dialog.Title className="text-[16px] font-bold text-ink">
          {credentials.fullName} is ready
        </Dialog.Title>
      </div>

      <Dialog.Description className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
        This password only works once — they&apos;ll be asked to pick their own
        the moment they sign in.
      </Dialog.Description>

      <dl className="mt-4 space-y-2 rounded-sm border border-line bg-canvas-sunk p-3.5">
        <div>
          <dt className="text-[11.5px] tracking-wide text-ink-faint uppercase">
            Email
          </dt>
          <dd className="font-mono text-[13px] break-all text-ink">
            {credentials.email}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] tracking-wide text-ink-faint uppercase">
            Temporary password
          </dt>
          <dd className="font-mono text-[15px] font-bold text-ink">
            {credentials.password}
          </dd>
        </div>
      </dl>

      {emailDelivery?.status === "sent" ? (
        <Note tone="invite" className="mt-3">
          Welcome email sent with the website login link, temporary password,
          and app download link.
        </Note>
      ) : (
        <Note
          tone={emailDelivery?.status === "failed" ? "warn" : "brand"}
          className="mt-3"
        >
          {emailDelivery?.message ??
            "This is the only time it's shown. If you lose it, use Reset password on their row."}
        </Note>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <CopyButton
          value={shareText}
          variant="secondary"
          label="Copy message"
          copiedLabel="Copied"
          toastMessage="Message copied — paste it to them"
        />
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

/** The digit a batch label contributes to the code, for the live hint. */
function batchDigit(batch: string): number {
  const digits = batch.match(/\d+/);
  if (digits) return Number(digits[0]);
  const letter = batch.replace(/batch/gi, " ").trim().match(/[a-z]/i);
  return letter ? letter[0].toUpperCase().charCodeAt(0) - 64 : 0;
}

/** Create an ambassador with a temporary password and send the welcome email. */
export function AddAmbassadorDialog() {
  const [open, setOpen] = React.useState(false);
  const [batch, setBatch] = React.useState("");
  const [password, setPassword] = React.useState(suggestPassword);
  const [issued, setIssued] = React.useState<
    CreatedAmbassador["credentials"] | null
  >(null);
  const [emailDelivery, setEmailDelivery] = React.useState<
    CreatedAmbassador["emailDelivery"] | null
  >(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setOpen(false);
    setIssued(null);
    setEmailDelivery(null);
    setBatch("");
    setPassword(suggestPassword());
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createAmbassador(formData);
      if (result.ok && result.credentials) {
        setIssued(result.credentials);
        setEmailDelivery(result.emailDelivery ?? null);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : reset())}
    >
      <Dialog.Trigger asChild>
        <Button>Add ambassador</Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className={PANEL}>
          {issued ? (
            <CredentialsPanel
              credentials={issued}
              emailDelivery={emailDelivery ?? undefined}
              onDone={reset}
            />
          ) : (
            <>
              <Dialog.Title className="text-[16px] font-bold text-ink">
                Add an ambassador
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                A welcome email goes out automatically with their website login
                link, temporary password, and app download link. You&apos;ll still
                see the credentials here as backup.
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

                {/* City and batch are what every geography and batch-vs-batch
                    number groups by. Collecting them at creation is the only
                    moment somebody reliably knows them. */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City" htmlFor="city">
                    <Input
                      id="city"
                      name="city"
                      list="dm-cities"
                      placeholder="Hyderabad"
                    />
                    <datalist id="dm-cities">
                      {CITY_OPTIONS.map((city) => (
                        <option key={city} value={city} />
                      ))}
                    </datalist>
                  </Field>

                  {/* Picked, not typed. The batch chooses the digit in their
                      referral code — DM2·01 is batch 2 — so a free text box
                      that accepted "67" or "Batch A" was writing code
                      prefixes nobody meant. */}
                  <Field
                    label="Batch"
                    htmlFor="batch"
                    hint={
                      batch
                        ? `Their code will start DM${batchDigit(batch)}`
                        : "Sets the digit in their referral code"
                    }
                  >
                    <select
                      id="batch"
                      name="batch"
                      value={batch}
                      onChange={(e) => setBatch(e.target.value)}
                      className="h-11 w-full rounded-lg border border-gray-200 bg-surface px-3 text-[14px] font-semibold text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="">Not set</option>
                      {BATCH_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field
                  label="Temporary password"
                  htmlFor="password"
                  hint="They'll be forced to change it on first sign-in."
                  required
                >
                  <div className="flex gap-2">
                    <Input
                      id="password"
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      title="Suggest another"
                      onClick={() => setPassword(suggestPassword())}
                    >
                      <RefreshCw aria-hidden />
                    </Button>
                  </div>
                </Field>

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="secondary">
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" loading={pending}>
                    Create account
                  </Button>
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Issue a fresh temporary password for someone locked out. */
export function ResetPasswordDialog({
  profileId,
  name,
}: {
  profileId: string;
  name: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState(suggestPassword);
  const [issued, setIssued] = React.useState<
    CreatedAmbassador["credentials"] | null
  >(null);
  const [emailDelivery, setEmailDelivery] = React.useState<
    CreatedAmbassador["emailDelivery"] | null
  >(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setOpen(false);
    setIssued(null);
    setEmailDelivery(null);
    setPassword(suggestPassword());
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = await resetAmbassadorPassword(profileId, password);
      if (result.ok && result.credentials) {
        setIssued(result.credentials);
        setEmailDelivery(result.emailDelivery ?? null);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : reset())}
    >
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="sm">
          Reset password
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Overlay />
        <Dialog.Content className={PANEL}>
          {issued ? (
            <CredentialsPanel
              credentials={issued}
              emailDelivery={emailDelivery ?? undefined}
              onDone={reset}
            />
          ) : (
            <>
              <Dialog.Title className="text-[16px] font-bold text-ink">
                Reset {name}&apos;s password
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                Their current password stops working immediately, and the new
                temporary password will be emailed with the website login link
                and app download link.
              </Dialog.Description>

              <form onSubmit={submit} className="mt-4 space-y-4">
                <Field label="New temporary password" htmlFor="reset-password" required>
                  <div className="flex gap-2">
                    <Input
                      id="reset-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                      autoFocus
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      title="Suggest another"
                      onClick={() => setPassword(suggestPassword())}
                    >
                      <RefreshCw aria-hidden />
                    </Button>
                  </div>
                </Field>

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="secondary">
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" variant="danger" loading={pending}>
                    Reset
                  </Button>
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
          <Dialog.Title className="text-[16px] font-bold text-ink">
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
