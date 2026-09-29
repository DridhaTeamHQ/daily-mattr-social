"use client";

import * as React from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

import { dataUrlToFile } from "@/components/share-qr";
import { Button, type ButtonProps } from "@/components/ui/button";

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
 * When a QR is passed in, it comes back as a small card image with the ask,
 * the code and the link drawn on it (see `drawShareCard`) — because WhatsApp
 * keeps a shared image and drops the text sent with it.
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

  const ask = referralAsk(code);

  /** The clipboard has no notion of a link field, so this one is glued. */
  const message = `${ask}\n${link}`;

  const qrFile = useShareCard(qr, code, link, qrFilename);

  async function share() {
    setBusy(true);

    // Started before anything is awaited. `navigator.share` needs the click's
    // transient activation, and putting an await in front of it is how you get
    // NotAllowedError on Android for a button that plainly was clicked.
    let sheet: Promise<void> | null = null;
    let sentImage = false;
    try {
      // With the QR attached, the link goes in `text`: apps that take a file
      // tend to drop the separate `url` field and keep only the caption.
      const withQr: ShareData | null = qrFile
        ? { title: "dailymattr", text: message, files: [qrFile] }
        : null;

      if (withQr && navigator.canShare?.(withQr)) {
        sheet = navigator.share(withQr);
        sentImage = true;
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
        // WhatsApp and others keep the image and quietly drop the text that
        // came with it. The card carries the code either way, but the link is
        // only tappable as text — so say where it is.
        if (sentImage && copied) {
          toast.success("Message copied — paste it with the QR so the link is tappable");
        }
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
 * Copy exactly what Share sends — the QR card and the message — for the places
 * a share sheet does not reach, like WhatsApp Web on a laptop.
 *
 * One clipboard entry holding both: an app that takes pictures pastes the
 * card, and a text box pastes the message. Browsers that cannot put a picture
 * on the clipboard get the message alone, which still carries the code and
 * the link.
 */
export function CopyReferralButton({
  code,
  link,
  qr,
  qrFilename = `dailymattr-${code}-qr.png`,
  ...props
}: {
  code: string;
  link: string;
  qr?: string | null;
  qrFilename?: string;
} & Omit<ButtonProps, "onClick" | "children">) {
  const [copied, setCopied] = React.useState(false);
  const message = `${referralAsk(code)}\n${link}`;
  const qrFile = useShareCard(qr, code, link, qrFilename);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    let withImage = false;
    try {
      if (qrFile && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": qrFile,
            "text/plain": new Blob([message], { type: "text/plain" }),
          }),
        ]);
        withImage = true;
      }
    } catch {
      withImage = false;
    }

    const ok = withImage || (await writeClipboard(message));
    if (!ok) {
      // Shown rather than failed silently, so it can be selected by hand.
      toast.error("Couldn't copy automatically", { description: message });
      return;
    }

    setCopied(true);
    toast.success(
      withImage
        ? "QR and message copied — paste them into the chat"
        : "Code and link copied — paste them anywhere",
    );
  }

  return (
    <Button onClick={copy} {...props}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied!" : "Copy link"}
    </Button>
  );
}

/** The ask, without the URL — a share's `url` field carries that. */
function referralAsk(code: string): string {
  return `Get dailymattr — use my referral code ${code}`;
}

/**
 * The QR card as a File, for sharing or copying.
 *
 * The bare QR until the card is drawn, so a tap in the first instant still
 * has something. Both are built before the click, not in it: making the File
 * after the tap would sit in front of `navigator.share` and spend the
 * activation.
 */
function useShareCard(
  qr: string | null | undefined,
  code: string,
  link: string,
  qrFilename: string,
): File | null {
  const plainQr = React.useMemo(
    () => (qr ? dataUrlToFile(qr, qrFilename) : null),
    [qr, qrFilename],
  );
  const [card, setCard] = React.useState<File | null>(null);
  React.useEffect(() => {
    if (!qr) return;
    let live = true;
    drawShareCard(qr, code, link).then((blob) => {
      if (live && blob) {
        setCard(new File([blob], qrFilename, { type: "image/png" }));
      }
    });
    return () => {
      live = false;
    };
  }, [qr, code, link, qrFilename]);
  return card ?? plainQr;
}

/**
 * The QR as a card with the message drawn on it.
 *
 * Share sheets hand an image and its caption to the app separately, and
 * WhatsApp in particular keeps the image and drops the caption. Drawing the
 * ask, the code and the link into the picture means a forward of the image
 * alone still tells the friend what to type.
 *
 * Drawn in the browser rather than on the server so the text uses the phone's
 * own fonts — a server without them renders the words as empty boxes.
 */
async function drawShareCard(
  qr: string,
  code: string,
  link: string,
): Promise<Blob | null> {
  try {
    const img = new Image();
    img.src = qr;
    await img.decode();

    const W = 1080;
    const pad = 72;
    const qrSize = 720;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const font = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

    // The link wraps by character — a URL has no spaces to break on.
    ctx.font = `600 25px ${mono}`;
    const linkLines: string[] = [];
    let line = "";
    for (const ch of link) {
      if (ctx.measureText(line + ch).width > W - pad * 2) {
        linkLines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) linkLines.push(line);

    const H = pad + 64 + 40 + qrSize + 48 + 40 + 16 + 96 + 40 + linkLines.length * 36 + pad;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    let y = pad;
    ctx.font = `800 56px ${font}`;
    ctx.fillText("Get dailymattr", W / 2, y);
    y += 64 + 40;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, (W - qrSize) / 2, y, qrSize, qrSize);
    y += qrSize + 48;

    ctx.fillStyle = "#4b5563";
    ctx.font = `600 36px ${font}`;
    ctx.fillText("Use my referral code", W / 2, y);
    y += 40 + 16;

    ctx.fillStyle = "#111827";
    ctx.font = `800 88px ${mono}`;
    ctx.fillText(code, W / 2, y);
    y += 96 + 40;

    ctx.fillStyle = "#1d4ed8";
    ctx.font = `600 25px ${mono}`;
    for (const l of linkLines) {
      ctx.fillText(l, W / 2, y);
      y += 36;
    }

    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  }
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
