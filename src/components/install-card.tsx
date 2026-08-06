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
}: {
  code: string;
  link: string;
  /** First name only — this is a poster, not a form. */
  name: string;
  /** The QR, already rendered on the server, as an SVG data URL. */
  qrDataUrl: string;
}) {
  const [busy, setBusy] = React.useState(false);

  /** Draws the poster and hands back a PNG. */
  const render = React.useCallback(async (): Promise<Blob | null> => {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // ── Ground
    ctx.fillStyle = BRAND;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // A band at the bottom so the link never sits on saturated blue, where
    // small text at forwarded-image quality stops being legible.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, HEIGHT - 190, WIDTH, 190);

    // ── Wordmark
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "700 46px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("dailymattr", WIDTH / 2, 120);

    // ── The ask
    ctx.font = "900 84px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Get the app", WIDTH / 2, 250);
    ctx.font = "600 38px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(`${name} is on DailyMattr — join them`, WIDTH / 2, 315);

    // ── QR on a white tile
    const tile = 520;
    const tileX = (WIDTH - tile) / 2;
    const tileY = 380;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, tileX, tileY, tile, tile, 36);
    ctx.fill();

    const qr = await loadImage(qrDataUrl);
    if (qr) {
      const pad = 40;
      ctx.drawImage(qr, tileX + pad, tileY + pad, tile - pad * 2, tile - pad * 2);
    }

    // ── The code, which is the part people read out loud
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 32px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("OR USE CODE", WIDTH / 2, tileY + tile + 90);
    ctx.font = "900 96px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(code, WIDTH / 2, tileY + tile + 190);

    // ── The link
    ctx.fillStyle = INK;
    ctx.font = "700 34px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(link.replace(/^https?:\/\//, ""), WIDTH / 2, HEIGHT - 105);
    ctx.fillStyle = "#6b7280";
    ctx.font = "600 26px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Scan the code or open the link", WIDTH / 2, HEIGHT - 55);

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }, [code, link, name, qrDataUrl]);

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
