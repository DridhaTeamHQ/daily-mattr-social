"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { setOwnPassword, type WelcomeState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";

const initial: WelcomeState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" loading={pending}>
      Set password and start
    </Button>
  );
}

export function WelcomeForm() {
  const [state, formAction] = useActionState(setOwnPassword, initial);

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="New password"
        htmlFor="password"
        hint="At least 8 characters. Don't reuse the one you were given."
        required
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          autoFocus
          aria-invalid={state.error ? true : undefined}
        />
      </Field>

      <Field label="Confirm password" htmlFor="confirm" required>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={state.error ? true : undefined}
        />
      </Field>

      {state.error && <Note tone="bad">{state.error}</Note>}

      <SubmitButton />
    </form>
  );
}
