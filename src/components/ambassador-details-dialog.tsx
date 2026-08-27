"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import { updateAmbassadorSegments } from "@/lib/admin/actions";
import { BATCH_OPTIONS, CITY_OPTIONS } from "@/lib/batches";
import {
  codeProblem,
  isStructuredCode,
  normalizeCode,
} from "@/lib/referral-code-shape";

const PANEL = [
  "animate-rise fixed z-50 bg-surface shadow-pop",
  "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-lg p-5",
  "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md",
  "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
].join(" ");

/**
 * Fix a profile's college, city and batch.
 *
 * These were collectable only when the account was made, so anybody added
 * before the fields existed sat in "Unassigned" forever and every batch or
 * geography breakdown was mostly that one row.
 */
export function AmbassadorDetailsDialog({
  profile,
  trigger,
}: {
  profile: {
    id: string;
    full_name: string;
    college: string | null;
    city: string | null;
    batch: string | null;
    referral_code: string;
  };
  /**
   * Overridable so the same dialog can open from a row in the list as well as
   * from the button on the person's own page. The alternative was a second
   * dialog with the same fields, which is how two forms drift apart.
   */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [batch, setBatch] = React.useState(profile.batch ?? "");
  const [code, setCode] = React.useState(profile.referral_code);
  const [reissue, setReissue] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const legacyCode = !isStructuredCode(profile.referral_code);

  // Reissuing replaces the code with a generated one, so whatever is in the
  // box is about to be overwritten — no point grading it.
  const problem = reissue ? null : codeProblem(code);
  const codeChanged = !reissue && code !== profile.referral_code;

  /**
   * Closing has to forget an abandoned edit, or the box still holds the code
   * typed last time and reopening would offer it up for Save without anyone
   * meaning to. A successful save closes through `setOpen` instead, so what
   * was just stored stays on screen until the row re-renders behind it.
   */
  function onOpenChange(next: boolean) {
    if (!next) {
      setCode(profile.referral_code);
      setReissue(false);
      setBatch(profile.batch ?? "");
    }
    setOpen(next);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateAmbassadorSegments(profile.id, formData);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        {trigger ?? (
          <Button size="sm" variant="secondary">
            Edit details
          </Button>
        )}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
        <Dialog.Content className={PANEL}>
          <Dialog.Title className="text-[16px] font-bold text-ink">
            {profile.full_name || "Ambassador"}
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            City and batch are what every geography and batch-vs-batch number
            groups by.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            {/* Names get typed wrong, married, shortened and corrected. It was
                the one field on this record with no way to fix it. */}
            <Field label="Full name" htmlFor="full_name" required>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile.full_name}
                required
                autoFocus
              />
            </Field>

            <Field label="College/Office" htmlFor="college">
              <Input
                id="college"
                name="college"
                defaultValue={profile.college ?? ""}
                placeholder="Optional"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="City" htmlFor="city">
                <Input
                  id="city"
                  name="city"
                  list="dm-cities-edit"
                  defaultValue={profile.city ?? ""}
                  placeholder="Hyderabad"
                />
                <datalist id="dm-cities-edit">
                  {CITY_OPTIONS.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              </Field>

              <Field label="Batch" htmlFor="batch">
                <select
                  id="batch"
                  name="batch"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-surface px-3 text-[14px] font-semibold text-ink focus:border-brand focus:outline-none"
                >
                  <option value="">Not set</option>
                  {/* Whatever is already stored stays selectable, so opening
                      the dialog on an odd value cannot silently change it. */}
                  {batch && !BATCH_OPTIONS.includes(batch) && (
                    <option value={batch}>{batch}</option>
                  )}
                  {BATCH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Editable, because the generated serial is only ever a guess at
                what the programme wants. A code gets promised to a college in
                a WhatsApp message, or printed wrong, and until now the only
                way to change one was to reissue and take whatever came out. */}
            <Field
              label="Referral code"
              htmlFor="referral_code"
              error={problem}
              hint={
                reissue
                  ? "A fresh code will be generated from the batch above."
                  : "Goes in their share link, so letters and digits only."
              }
            >
              <Input
                id="referral_code"
                name="referral_code"
                value={code}
                // Upper-cased as they type rather than silently on save: the
                // field should show the code that is actually going to be
                // stored, since that is the one the link will carry.
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                disabled={reissue}
                className="font-mono"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={problem ? true : undefined}
              />
            </Field>

            {legacyCode && (
              <label className="flex items-start gap-2.5 rounded-lg border border-line bg-canvas-sunk p-3">
                <input
                  type="checkbox"
                  name="reissue_code"
                  checked={reissue}
                  onChange={(e) => setReissue(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-brand)]"
                />
                <span className="text-[13px] leading-relaxed font-semibold text-ink">
                  Reissue their referral code to match the batch
                  <span className="mt-0.5 block text-[12px] font-medium text-ink-soft">
                    Theirs is{" "}
                    <code className="font-mono">{profile.referral_code}</code>,
                    from before codes carried the batch.
                  </span>
                </span>
              </label>
            )}

            {/* One warning for both routes to a new code — typing one by hand
                breaks an already-shared link exactly as reissuing does. */}
            {(codeChanged || reissue) && (
              <Note tone="warn">
                Any link already shared with{" "}
                <code className="font-mono">{profile.referral_code}</code> stops
                working. Clicks and referrals already credited to them are kept.
              </Note>
            )}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={pending} disabled={!!problem}>
                Save
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
