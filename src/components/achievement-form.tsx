"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { addAchievement } from "@/lib/admin/edit-actions";

/**
 * Writing one achievement onto an ambassador's record.
 *
 * Inline on the page rather than behind a dialog: this is meant to be typed in
 * quickly while looking at the rest of their record, and a modal would hide
 * exactly the thing an admin is reading to decide what to write.
 *
 * The form is cleared only on success. A failed save that wiped what somebody
 * just typed would be worse than the failure.
 */
export function AchievementForm({ ambassadorId }: { ambassadorId: string }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        startTransition(async () => {
          const result = await addAchievement(ambassadorId, formData);
          if (result.ok) {
            toast.success(result.message);
            formRef.current?.reset();
          } else {
            toast.error(result.message);
          }
        });
      }}
      className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-canvas-sunk p-4"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Field label="What they did" htmlFor="achievement-title" required>
          <Input
            id="achievement-title"
            name="title"
            placeholder="Ran the orientation stall at GIET"
            maxLength={120}
            required
          />
        </Field>

        <Field label="When" htmlFor="achievement-date">
          <Input id="achievement-date" name="awarded_at" type="date" />
        </Field>
      </div>

      <Field label="Note" htmlFor="achievement-note">
        <Textarea
          id="achievement-note"
          name="note"
          rows={2}
          maxLength={500}
          placeholder="Optional — anything worth remembering about it."
        />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          <Plus aria-hidden />
          Add achievement
        </Button>
      </div>
    </form>
  );
}
