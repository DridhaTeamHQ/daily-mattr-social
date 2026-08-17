"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { CircleCheck, ImageIcon, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { useCelebration } from "@/components/celebrate";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/feedback";
import { uploadSubmission } from "@/lib/submissions/actions";

const MAX_BYTES = 10 * 1024 * 1024;

export function UploadTask({
  taskId,
  taskLabel,
  expectedHandle,
  disabled = false,
}: {
  taskId: string;
  taskLabel: string;
  expectedHandle: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const celebrate = useCelebration();

  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  /**
   * The file and its preview URL are one piece of state.
   *
   * `URL.createObjectURL` is a side effect, so it belongs in the event handler
   * that picks the file — not in an effect deriving it afterwards, and not in
   * render. Keeping them together also guarantees the URL being revoked is
   * always the one belonging to the file being replaced.
   */
  const [picked, setPicked] = React.useState<{ file: File; url: string } | null>(
    null,
  );

  // Object URLs are a manual resource: without a revoke they hold the image in
  // memory until the tab closes.
  const liveUrl = React.useRef<string | null>(null);

  React.useEffect(
    () => () => {
      if (liveUrl.current) URL.revokeObjectURL(liveUrl.current);
    },
    [],
  );

  function replacePicked(next: { file: File; url: string } | null) {
    if (liveUrl.current) URL.revokeObjectURL(liveUrl.current);
    liveUrl.current = next?.url ?? null;
    setPicked(next);
  }

  function choose(next: File | null) {
    setError(null);

    if (!next) {
      replacePicked(null);
      return;
    }
    if (!next.type.startsWith("image/")) {
      setError("That's not an image. Pick a screenshot from your gallery.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError("That image is over 10MB. A screenshot should be far smaller.");
      return;
    }
    replacePicked({ file: next, url: URL.createObjectURL(next) });
  }

  function reset() {
    setOpen(false);
    replacePicked(null);
    setError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!picked) return;

    const formData = new FormData();
    formData.append("screenshot", picked.file);

    startTransition(async () => {
      const result = await uploadSubmission(taskId, formData);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      reset();
      router.refresh();

      if (result.status === "auto_approved") {
        celebrate();
        toast.success(result.message);
      } else {
        toast.success(result.message, {
          description: "You'll get a notification when it's checked.",
        });
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : reset())}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="outline-blue" disabled={disabled}>
          <Upload aria-hidden />
          Upload
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content
          className={[
            "animate-rise brut-lg fixed z-50 bg-surface",
            "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-lg p-5",
            "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md",
            "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
            "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
          ].join(" ")}
        >
          <Dialog.Title className="display text-[20px] text-ink pr-8">
            {taskLabel}
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed font-semibold text-ink-soft">
            Upload a screenshot showing this done on{" "}
            <span className="text-ink">@{expectedHandle}</span>. Once approved,
            this task increases your completion percentage.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <label
              className={[
                "brut flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md bg-canvas-sunk text-center",
                picked ? "p-2" : "px-4 py-8",
                "transition-transform hover:-translate-x-px hover:-translate-y-px",
              ].join(" ")}
            >
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
              />

              {picked ? (
                <span className="relative block h-40 w-full">
                  <Image
                    src={picked.url}
                    alt="Your screenshot"
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </span>
              ) : (
                <>
                  <span className="brut-sm grid size-12 place-items-center rounded-sm bg-brand">
                    <ImageIcon className="size-6 text-ink" />
                  </span>
                  <span className="text-[14px] font-extrabold text-ink">
                    Tap to pick a screenshot
                  </span>
                  <span className="text-[12.5px] font-semibold text-ink-soft">
                    PNG or JPG, up to 10MB
                  </span>
                </>
              )}
            </label>

            {picked && (
              <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-ok">
                <CircleCheck className="size-4" />
                {picked.file.name} ·{" "}
                {(picked.file.size / 1024 / 1024).toFixed(1)}MB
              </p>
            )}

            {error && <Note tone="bad">{error}</Note>}

            <Note tone="neutral">
              Make sure the handle and the completed action are both visible.
              Reusing someone else&apos;s screenshot is caught automatically.
            </Note>

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={pending} disabled={!picked}>
                <Upload aria-hidden />
                Submit
              </Button>
            </div>
          </form>

          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="brut-sm absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-surface text-ink"
            >
              <X className="size-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
