"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { resetPassword, type ResetState } from "./actions";
import {
  PasswordInput,
  PasswordRules,
  passwordChecks,
} from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";

const initial: ResetState = { error: null };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full"
      size="lg"
      loading={pending}
      disabled={disabled}
    >
      Save and sign in
    </Button>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPassword, initial);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const meetsRules = passwordChecks(password).every((c) => c.ok);
  const matches = confirm.length > 0 && password === confirm;

  // Mismatch is only worth saying once they have actually typed a second
  // password. Flagging it on the first keystroke is just noise.
  const mismatch = confirm.length > 0 && !matches;

  return (
    <form action={formAction} className="space-y-4">
      <Field label="New password" htmlFor="password" required>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={setPassword}
          invalid={Boolean(state.error)}
        />
        <PasswordRules value={password} />
      </Field>

      <Field label="Confirm password" htmlFor="confirm" required>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={setConfirm}
          invalid={mismatch}
        />
        {mismatch && (
          <p className="mt-1.5 text-[12px] font-bold text-bad">
            These don&apos;t match yet.
          </p>
        )}
      </Field>

      {state.error && <Note tone="bad">{state.error}</Note>}

      {/* Disabled until it can actually succeed. The server re-checks all of
          this — the button is a courtesy, not the guard. */}
      <SubmitButton disabled={!meetsRules || !matches} />
    </form>
  );
}
