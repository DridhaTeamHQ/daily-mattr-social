"use client";

import * as React from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";

import { dataUrlToFile } from "@/components/share-qr";
import { Button } from "@/components/ui/button";

/**
 * Hand over the referral, as the two things a friend actually needs.
 *
 * This used to draw a 4:5 poster on a canvas — the code, a QR and the ask, as
 * one forwardable image. The QR is gone with the Android-only build, and a
 * poster whose whole centre was the QR is not worth keeping for the caption
 * around it. What is left is the part that always did the work: a line of text
 * carrying the code and the link together.
 *
 * Both, not one. A link on its own installs the app but never tells the friend
 * which code to type, and a code on its own is useless until they find the
 * app — so a share that carries a single one of them costs the ambassador the
 * referral either way.
 *
 * The clipboard is written as well as the sheet being opened, because the sheet
 * can be dismissed and WhatsApp is not the only place a student pastes this.
 */
export function ShareReferralButton({
  code,
  link,
  qr,
  qrFilename = `dailymattr-${code}-qr.png`,
}: {
  code: string;
  link: string;
  /**
   * The QR for `link`, as a PNG data URL. When given, it goes out as an image
   * in the same share — one message with the picture, the code and the link,
   * rather than a second button that sends the picture on its own.
   */
  qr?: string | null;
  qrFilename?: string;
}) {
  const [busy, setBusy] = React.useState(false);

  // Built before the click, not in it: turning the data URL into a File after
  // the tap would sit in front of `navigator.share` and spend the activation.
  const qrFile = React.useMemo(
    () => (qr ? dataUrlToFile(qr, qrFilename) : null),
    [qr, qrFilename],
  );

  /** The ask, without the URL — `url` carries that so it arrives as a link. */
  const ask = `Get dailymattr — use my referral code ${code}`;

  /** The clipboard has no notion of a link field, so this one is glued. */
  const message = `${ask}\n${link}`;

  async function share() {
    setBusy(true);

    // Started before anything is awaited. `navigator.share` needs the click's
    // transient activation, and putting an await in front of it is how you get
    // NotAllowedError on Android for a button that plainly was clicked.
    let sheet: Promise<void> | null = null;
    try {
      // With the QR attached, the link goes in `text`: apps that take a file
      // tend to drop the separate `url` field and keep only the caption.
      const withQr: ShareData | null = qrFile
        ? { title: "dailymattr", text: message, files: [qrFile] }
        : null;

      if (withQr && navigator.canShare?.(withQr)) {
        sheet = navigator.share(withQr);
      } else if (navigator.share) {
        // `url` as its own field, not glued into `text`. WhatsApp and the rest
        // linkify what arrives in `url` and leave a pasted string alone, and a
        // referral link nobody can tap is a referral nobody makes.
        sheet = navigator.share({ title: "dailymattr", text: ask, url: link });
      }
    } catch {
      // Some browsers throw synchronously rather than rejecting.
      sheet = null;
    }

    const copied = await writeClipboard(message);

    try {
      if (sheet) {
        await sheet;
        return;
      }
    } catch (err) {
      // Dismissing the sheet rejects. That is not a failure — it is a student
      // changing their mind, and the clipboard still has the message.
      if ((err as Error)?.name !== "AbortError" && !copied) {
        toast.error("Couldn't share. Copy the link above instead.");
        return;
      }
    } finally {
      setBusy(false);
    }

    if (copied) {
      toast.success("Code and link copied — paste them anywhere");
    } else {
      toast.error("Couldn't copy. Use the link above instead.");
    }
  }

  return (
    <Button onClick={share} loading={busy}>
      <Share2 aria-hidden />
      Share code &amp; link
    </Button>
  );
}

/**
 * Best effort, and never thrown from.
 *
 * The clipboard is permission-gated and simply absent over plain HTTP on a
 * phone, which is a thing that happens on a campus wifi portal. A share that
 * worked must not report an error because the consolation copy did not.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
