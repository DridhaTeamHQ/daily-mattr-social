"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Copies `value` and confirms it inline. The tick is the real feedback — the
 * toast is for the case where the button scrolls out of view on a phone.
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  toastMessage,
  ...props
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  toastMessage?: string;
} & Omit<ButtonProps, "onClick" | "children">) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(toastMessage ?? "Copied to clipboard");
    } catch {
      // Clipboard access is blocked outside a secure context, and on a shared
      // campus laptop that is not unusual. Show the value so it can be
      // selected by hand rather than failing silently.
      toast.error("Couldn't copy automatically", { description: value });
    }
  }

  return (
    <Button onClick={copy} {...props}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
