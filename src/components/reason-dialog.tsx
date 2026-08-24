"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/lib/admin/guards";

/**
 * A destructive action with a written reason attached.
 *
 * The reason reaches the student, so it is asked for every time. It is
 * required by default — "rejected, no explanation" is how an ambassador
 * programme loses ambassadors — but `optional` lets a caller take the answer
 * as a courtesy instead of a gate, for the decisions an admin makes twenty of
 * in a row where the alternative is twenty copies of the same sentence.
 */
export function ReasonDialog({
  action,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  trigger,
  onSuccess,
  optional = false,
  hint,
}: {
  action: (reason: string) => Promise<ActionResult>;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  trigger: React.ReactElement<ButtonProps>;
  /** Runs after the action reports success — for clearing whatever it acted on. */
  onSuccess?: () => void;
  /** Lets the action go through with the box empty. */
  optional?: boolean;
  /** A line under the box. Say what happens when it is left empty. */
  hint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      try {
        const result = await action(reason);
        if (result.ok) {
          toast.success(result.message);
          setOpen(false);
          setReason("");
          onSuccess?.();
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("That didn't go through. Try again.");
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
        <Dialog.Content
          className={[
            "animate-rise fixed z-50 bg-surface shadow-pop",
            // Bottom sheet on phones, centred dialog from sm up.
            "inset-x-0 bottom-0 rounded-t-lg p-5",
            "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md",
            "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
          ].join(" ")}
        >
          <Dialog.Title className="text-[16px] font-semibold text-ink">
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
              {description}
            </Dialog.Description>
          )}

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field
              label={label}
              htmlFor="reason"
              required={!optional}
              hint={hint}
            >
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={placeholder}
                required={!optional}
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
                disabled={!optional && !reason.trim()}
              >
                {confirmLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
