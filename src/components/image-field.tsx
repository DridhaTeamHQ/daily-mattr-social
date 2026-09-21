"use client";

import * as React from "react";
import Image from "next/image";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { uploadSurveyImage } from "@/lib/admin/upload-actions";
import { cn } from "@/lib/utils";

/**
 * Attach a picture to something, anywhere in the survey editors.
 *
 * One component for the question's own image and for each option's, because
 * they are the same job at two sizes and two copies would drift the moment
 * one of them learned about a new file type.
 *
 * ─── It uploads on pick, not on save ───────────────────────────────────────
 *
 * The alternative is to hold the File in state and send everything with the
 * form. That would mean an admin who spends ten minutes writing a survey finds
 * out on submit that one of six images was too big, with no clue which. Here a
 * rejected file is rejected next to the box it was dropped on, while the
 * reason is still obvious.
 *
 * The cost is an orphaned object in the bucket when somebody uploads an image
 * and then abandons the draft. That is a few kilobytes in a bucket we own and
 * nobody can enumerate, against an editing experience that tells the truth
 * immediately — the same trade the screenshot pipeline makes, and the same one
 * the campaign media bucket was built for.
 */
export function ImageField({
  value,
  onChange,
  /** `option` is the small square beside a choice; `question` is the wide one. */
  size = "question",
  label = "Add image",
  className,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  size?: "question" | "option";
  label?: string;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const small = size === "option";

  async function pick(file: File | undefined) {
    if (!file) return;

    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);

      const result = await uploadSurveyImage(body);
      if (result.ok) {
        onChange(result.url);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("That image didn't upload. Try again.");
    } finally {
      setBusy(false);
      // Cleared so picking the same file twice in a row still fires a change
      // event — otherwise a failed upload cannot be retried with the same
      // file, which is exactly the file somebody would retry with.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => pick(event.target.files?.[0])}
      />

      {value ? (
        <>
          {/* `unoptimized`, because these live on the Supabase bucket rather
              than in the app's own image pipeline, and the admin editor is
              not the place to spend a transform on a thumbnail. */}
          <span
            className={cn(
              "relative block shrink-0 overflow-hidden rounded-md border border-gray-200 bg-canvas-sunk",
              small ? "size-11" : "h-20 w-32",
            )}
          >
            <Image
              src={value}
              alt=""
              fill
              unoptimized
              sizes={small ? "44px" : "128px"}
              className="object-cover"
            />
          </span>

          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="text-left text-[12px] font-bold text-brand-strong hover:underline disabled:opacity-60"
            >
              {busy ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              disabled={busy}
              // Only the reference is dropped. The file stays in the bucket,
              // which matters if the admin changes their mind — and costs
              // less than a delete that could race a survey still being saved.
              onClick={() => onChange(null)}
              className="text-left text-[12px] font-bold text-ink-soft hover:text-bad disabled:opacity-60"
            >
              Remove
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title="PNG, JPEG or WebP, up to 5 MB"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-surface font-bold text-ink-soft transition-colors",
            "hover:border-brand hover:text-brand disabled:opacity-60",
            small ? "size-11 justify-center p-0" : "px-2.5 py-1.5 text-[12px]",
          )}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="size-4 shrink-0" aria-hidden />
          )}
          {/* The small one is icon-only, so the words move into the tooltip
              and the screen-reader label rather than disappearing. */}
          {small ? (
            <span className="sr-only">{label}</span>
          ) : (
            <span>{busy ? "Uploading…" : label}</span>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Keeps the picture list the same length as the label list.
 *
 * `option_images` is indexed to match `options`, so every edit that moves a
 * label has to move its picture with it — adding, removing and reordering all
 * go through here rather than being written out three times in two editors.
 * Trailing blanks are trimmed, so a question whose images were all removed
 * stores `[]` rather than a row of nulls.
 */
export function alignImages(
  images: (string | null)[] | undefined,
  count: number,
): (string | null)[] {
  const next = Array.from({ length: count }, (_, i) => images?.[i] ?? null);
  while (next.length > 0 && next[next.length - 1] === null) next.pop();
  return next;
}

/** Drops the picture at `index`, closing the gap so the rest still line up. */
export function removeImageAt(
  images: (string | null)[] | undefined,
  index: number,
  count: number,
): (string | null)[] {
  const next = [...(images ?? [])];
  next.splice(index, 1);
  return alignImages(next, count);
}

/** Replaces one picture without disturbing its neighbours. */
export function setImageAt(
  images: (string | null)[] | undefined,
  index: number,
  url: string | null,
  count: number,
): (string | null)[] {
  const next = alignImages(images, count);
  next[index] = url;
  return alignImages(next, count);
}
