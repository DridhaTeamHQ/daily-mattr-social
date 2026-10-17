"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sendWelcomeEmails } from "@/lib/admin/welcome-actions";

/** Matches MAX_PER_CALL in welcome-actions.ts. */
const CHUNK = 20;

/**
 * Send the welcome email to one invited ambassador or a whole selection.
 *
 * Asks first, every time: this emails real students and gives each a new
 * password, and two hundred of those cannot be unsent. A long selection goes
 * through in chunks of twenty with a running count, so a batch of 220 shows
 * "Emailed 140 of 220…" and, if something stops it, says how far it got.
 */
export function SendMailButton({
  ids,
  label,
  variant = "secondary",
  size = "sm",
  iconOnly = false,
  className,
  onDone,
}: {
  ids: string[];
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  /**
   * Just the envelope, with the label as its accessible name and tooltip —
   * for a table row, where the words pushed the button over the next column.
   */
  iconOnly?: boolean;
  className?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const count = ids.length;

  async function send() {
    const who = count === 1 ? "this ambassador" : `these ${count} ambassadors`;
    if (
      !window.confirm(
        `Email ${who} their login now? Each gets a new temporary password in the email.`,
      )
    ) {
      return;
    }

    setBusy(true);
    const progress = toast.loading(`Emailing 0 of ${count}…`);
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    try {
      for (let start = 0; start < count; start += CHUNK) {
        const result = await sendWelcomeEmails(ids.slice(start, start + CHUNK));
        // A refusal for the whole call (no email set up, signed out) stops
        // the run rather than repeating the same error eleven times.
        if (!result.ok && result.sent + result.failed + result.skipped === 0) {
          toast.error(result.message, { id: progress });
          return;
        }
        sent += result.sent;
        failed += result.failed;
        skipped += result.skipped;
        toast.loading(`Emailing ${Math.min(start + CHUNK, count)} of ${count}…`, {
          id: progress,
        });
      }

      const parts = [`Emailed ${sent}`];
      if (failed) parts.push(`${failed} failed — try those again`);
      if (skipped) parts.push(`${skipped} not invited, skipped`);
      (failed ? toast.warning : toast.success)(parts.join(" · "), { id: progress });
      onDone?.();
    } catch {
      toast.error(`Stopped after ${sent} — try the rest again.`, { id: progress });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const text = label ?? (count === 1 ? "Send mail" : `Send mail ${count}`);

  return (
    <Button
      size={iconOnly ? "icon" : size}
      variant={variant}
      className={cn(iconOnly && "size-8", className)}
      disabled={busy || count === 0}
      onClick={send}
      aria-label={iconOnly ? text : undefined}
      title={iconOnly ? text : undefined}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
      {!iconOnly && text}
    </Button>
  );
}
