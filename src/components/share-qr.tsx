"use client";

import * as React from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Send the QR itself through the share sheet — the image, with the code and
 * the link riding along as its caption.
 *
 * The caption matters as much as the picture: a QR installs the app, but the
 * referral is only credited once the friend types the code, and a bare image
 * forwarded twice has lost any message that went with it.
 *
 * The File is built from the data URL up front rather than on click.
 * `navigator.share` needs the click's transient activation, and anything
 * awaited in front of it — a `fetch(dataUrl)` included — spends it and gets
 * NotAllowedError on Android.
 *
 * Where files cannot be shared (most desktop browsers, older iOS), it saves
 * the PNG instead, which is the next best thing to do with it.
 */
export function ShareQrButton({
  src,
  filename,
  code,
  link,
  className,
}: {
  /** PNG data URL. */
  src: string;
  filename: string;
  code: string;
  link: string;
  className?: string;
}) {
  const file = React.useMemo(() => dataUrlToFile(src, filename), [src, filename]);

  async function share() {
    const text = `Scan to get dailymattr — then enter my referral code ${code}\n${link}`;
    const data: ShareData = { title: "dailymattr", text, files: file ? [file] : [] };

    let canShareFile = false;
    try {
      canShareFile = Boolean(file && navigator.canShare?.(data));
    } catch {
      canShareFile = false;
    }

    if (canShareFile) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        // Dismissing the sheet is a student changing their mind, not a failure.
        if ((err as Error)?.name === "AbortError") return;
      }
    }

    download(src, filename);
    toast.success("QR saved — attach it anywhere, with your code");
  }

  return (
    <button type="button" onClick={share} className={className}>
      <Share2 className="size-3.5" aria-hidden />
      Share QR
    </button>
  );
}

export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
    const [header, base64] = dataUrl.split(",");
    const type = /data:([^;]+)/.exec(header)?.[1] ?? "image/png";
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new File([bytes], filename, { type });
  } catch {
    return null;
  }
}

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
