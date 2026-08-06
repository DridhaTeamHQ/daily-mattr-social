"use client";

import * as React from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * The referral page, as one thing you can send.
 *
 * The page had a code, a QR and a link in three separate cards, and sharing it
 * meant copying one of them into WhatsApp and typing the rest of the sentence
 * yourself. What a student actually wants to send is a picture: the code, the
 * QR and the ask, in one image that survives being forwarded.
 *
 * So this draws that image. Canvas rather than a screenshot library, because a
 * dependency that walks the DOM and re-implements CSS is a lot of bytes for a
 * layout we control completely — and because the shared image should be a
 * fixed 4:5 poster regardless of the phone it was made on.
 *
 * `navigator.share` with the file where it exists (every Android browser the
 * students use, and iOS Safari), the download where it does not.
 */

const WIDTH = 1080;
const HEIGHT = 1350;

const INK = "#0a0a0a";
const BRAND = "#3979ff";

export function InstallCard({
  code,
  link,
  name,
  qrDataUrl,
  logoDataUrl,
}: {
  code: string;
  link: string;
  /** First name only — this is a poster, not a form. */
  name: string;
  /** The QR, already rendered on the server, as an SVG data URL. */
  qrDataUrl: string;
  /** The wordmark, same paths as everywhere else in the app. */
  logoDataUrl: string;
}) {
  const [busy, setBusy] = React.useState(false);

  /** Draws the poster and hands back a PNG. */
  const render = React.useCallback(async (): Promise<Blob | null> => {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = BRAND;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = "center";

    // ── The mark, as artwork rather than as the word typed out. Drawn from
    //    the same paths the app uses, so the poster cannot drift from the
    //    logo everywhere else.
    const logo = await loadImage(logoDataUrl);
    if (logo) {
      const w = 400;
      // 12886:2658 — the mark's own ratio. Hard-coding a height instead would
      // squash it the first time the artwork changes.
      ctx.drawImage(logo, (WIDTH - w) / 2, 92, w, (w * 2658) / 12886);
    }

    // ── The ask
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 84px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Get the app", WIDTH / 2, 268);
    ctx.font = "600 36px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText(`${name} is on DailyMattr — join them`, WIDTH / 2, 328);

    // ── One white card holding everything a stranger has to act on. The
    //    shadow is what stops it reading as a hole cut in the blue.
    const cardX = 90;
    const cardY = 386;
    const cardW = WIDTH - cardX * 2;
    const cardH = 744;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, cardX, cardY, cardW, cardH, 44);
    ctx.fill();
    ctx.restore();

    const qr = await loadImage(qrDataUrl);
    const qrSize = 440;
    if (qr) {
      ctx.drawImage(qr, (WIDTH - qrSize) / 2, cardY + 48, qrSize, qrSize);
    }

    // ── A rule, so the code reads as a second way in rather than a caption
    //    on the QR.
    const ruleY = cardY + 48 + qrSize + 56;
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cardX + 80, ruleY);
    ctx.lineTo(WIDTH - cardX - 80, ruleY);
    ctx.stroke();

    ctx.fillStyle = "#6b7280";
    ctx.font = "800 28px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(spaced("USE THE CODE"), WIDTH / 2, ruleY + 62);

    ctx.fillStyle = INK;
    ctx.font = "900 92px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(code, WIDTH / 2, ruleY + 156);

    // ── The link, for anyone who cannot scan a screen they are holding
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "700 30px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(link.replace(/^https?:\/\//, ""), WIDTH / 2, 1224);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "600 26px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Scan the code or open the link", WIDTH / 2, 1274);

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }, [code, link, name, qrDataUrl, logoDataUrl]);

  async function share() {
    setBusy(true);
    try {
      const blob = await render();
      const file = blob
        ? new File([blob], `dailymattr-${code}.png`, { type: "image/png" })
        : null;

      const text = `Get DailyMattr — use my code ${code}`;

      // canShare with the file, not just share: Android reports share support
      // long before it will accept an attachment, and calling it anyway throws
      // after the sheet has already opened.
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: "DailyMattr" });
        return;
      }

      if (navigator.share) {
        await navigator.share({ text, url: link, title: "DailyMattr" });
        return;
      }

      await navigator.clipboard.writeText(`${text}\n${link}`);
      toast.success("Link copied — paste it wherever you like");
    } catch (err) {
      // Dismissing the share sheet rejects. That is not a failure worth a
      // toast; anything else is.
      if ((err as Error)?.name !== "AbortError") {
        toast.error("Couldn't open the share sheet. Try saving the image.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const blob = await render();
      if (!blob) throw new Error("no image");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dailymattr-${code}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Card saved to your downloads");
    } catch {
      toast.error("Couldn't save the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={share} loading={busy}>
        <Share2 aria-hidden />
        Share my card
      </Button>
      <Button variant="secondary" onClick={save} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        Save image
      </Button>
    </div>
  );
}

/** Letter-spacing, which canvas has no property for. */
function spaced(text: string): string {
  return text.split("").join(" ");
}

/** `roundRect` is not in every browser the students are on. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
