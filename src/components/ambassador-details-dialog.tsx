"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import { updateAmbassadorSegments } from "@/lib/admin/actions";
import { BATCH_OPTIONS, CITY_OPTIONS } from "@/lib/batches";
import { isStructuredCode } from "@/lib/referral-code-shape";

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
}: {
  profile: {
    id: string;
    full_name: string;
    college: string | null;
    city: string | null;
    batch: string | null;
    referral_code: string;
  };
}) {
  const [open, setOpen] = React.useState(false);
  const [batch, setBatch] = React.useState(profile.batch ?? "");
  const [pending, startTransition] = React.useTransition();

  const legacyCode = !isStructuredCode(profile.referral_code);

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
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="secondary">
          Edit details
        </Button>
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

            <Field label="College" htmlFor="college">
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

            {legacyCode && (
              <div>
                <label className="flex items-start gap-2.5 rounded-lg border border-line bg-canvas-sunk p-3">
                  <input
                    type="checkbox"
                    name="reissue_code"
                    className="mt-0.5 size-4 accent-[var(--color-brand)]"
                  />
                  <span className="text-[13px] leading-relaxed font-semibold text-ink">
                    Reissue their referral code to match the batch
                    <span className="mt-0.5 block text-[12px] font-medium text-ink-soft">
                      Theirs is{" "}
                      <code className="font-mono">{profile.referral_code}</code>
                      , from before codes carried the batch.
                    </span>
                  </span>
                </label>

                <Note tone="warn" className="mt-2">
                  Any link already shared with the old code stops working.
                </Note>
              </div>
            )}

            <div className="flex justify-end gap-2">
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
