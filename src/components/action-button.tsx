"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/lib/admin/guards";

/**
 * Runs a bound server action and reports the outcome as a toast.
 *
 * Pass the action already bound to its arguments — `approveSubmission.bind(null,
 * id)` — so the client only ever holds an opaque reference, never the record it
 * operates on.
 */
export function ActionButton({
  action,
  children,
  confirmMessage,
  successMessage,
  ...props
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  /** When set, the click asks first. Use for anything that moves points. */
  confirmMessage?: string;
  successMessage?: string;
} & Omit<ButtonProps, "onClick" | "children">) {
  const [pending, startTransition] = React.useTransition();

  function run() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(successMessage ?? result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("That didn't go through. Try again.");
      }
    });
  }

  return (
    <Button onClick={run} loading={pending} {...props}>
      {children}
    </Button>
  );
}
