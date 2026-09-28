import "server-only";

import QRCode from "qrcode";

/**
 * A QR code for a link, as a PNG data URL.
 *
 * Drawn on the server so the referrals page ships no QR library to the phone,
 * and a PNG rather than an SVG because the same URL doubles as the download:
 * a PNG is what WhatsApp, Instagram stories and a print shop all accept.
 *
 * Error correction "M" and a four-module quiet zone: a QR photographed off a
 * laptop screen across a table, or printed on a poster that has been folded,
 * still has to scan, and the quiet zone is what scanners need to find it.
 *
 * Returns null rather than throwing. A QR that could not be drawn leaves the
 * link and the share button beside it, which still do the job.
 */
export async function qrDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 480,
      color: { dark: "#111827", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}
