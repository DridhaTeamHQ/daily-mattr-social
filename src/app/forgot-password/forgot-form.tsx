"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CircleCheck } from "lucide-react";

import { requestPasswordReset, type ResetRequestState } from "@/lib/password-reset";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" loading={pending}>
      Send the link
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ResetRequestState, FormData>(
    requestPasswordReset,
    null,
  );

  // On success the form is replaced entirely. Leaving it on screen invites a
  // second submit, and the honest answer to "did it send?" is the same either
  // way, so a second attempt tells nobody anything new.
  if (state?.ok) {
    return (
      <Note tone="ok">
        <span className="flex items-start gap-2">
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </span>
      </Note>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Email" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@college.edu"
          required
          autoFocus
          aria-invalid={state && !state.ok ? true : undefined}
        />
      </Field>

      {state && !state.ok && <Note tone="bad">{state.message}</Note>}

      <SubmitButton />
    </form>
  );
}
