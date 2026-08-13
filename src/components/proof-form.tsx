"use client";

import * as React from "react";
import { Check, Link as LinkIcon, Loader2, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { submitProof } from "@/lib/submissions/proof-actions";
import { cn } from "@/lib/utils";

export function ProofForm({
  taskId,
  proofType,
  disabled = false,
}: {
  taskId: string;
  proofType: "link" | "text" | "none";
  disabled?: boolean;
}) {
  const [value, setValue] = React.useState("");
  const [result, setResult] = React.useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const ready =
    proofType === "none" ||
    (proofType === "link" ? value.trim().length > 8 : value.trim().length >= 10);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending || disabled) return;

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await submitProof(taskId, formData);
      setResult(res);
      if (res.ok) setValue("");
    });
  }

  if (result?.ok) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-600">
        <Check className="size-4" />
        {result.message}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {proofType === "link" && (
        <div className="flex items-center gap-2">
          <LinkIcon className="size-4 shrink-0 text-ink-faint" />
          <input
            name="proof_url"
            type="url"
            inputMode="url"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://linkedin.com/posts/..."
            disabled={disabled || pending}
            className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13.5px] font-medium text-ink focus:border-brand focus:outline-none disabled:opacity-60"
          />
        </div>
      )}

      {proofType === "text" && (
        <div className="flex items-start gap-2">
          <PenLine className="mt-2.5 size-4 shrink-0 text-ink-faint" />
          <textarea
            name="proof_text"
            rows={3}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Type your answer..."
            disabled={disabled || pending}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13.5px] font-medium text-ink focus:border-brand focus:outline-none disabled:opacity-60"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!ready || disabled} loading={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          {proofType === "none" ? "Mark done" : "Send"}
        </Button>
        <span className="text-[12px] font-semibold text-ink-soft">
          Checked by a person before it counts toward completion.
        </span>
      </div>

      {result && !result.ok && (
        <p role="status" className={cn("text-[12.5px] font-bold text-bad")}>
          {result.message}
        </p>
      )}
    </form>
  );
}
