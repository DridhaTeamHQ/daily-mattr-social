import QRCode from "qrcode";

import { CopyButton } from "@/components/copy-button";
import { InstallCard } from "@/components/install-card";
import { wordmarkSvg } from "@/components/logo";

/**
 * The shareable referral link, and the card a student can send.
 *
 * The QR used to be shown here beside the link. It is off the page while the
 * app is Android-only — a code pointed at a screen is a stall-and-poster tool,
 * and there is no stall to run until there is something both halves of a
 * crowd can install.
 *
 * It is still *generated*, because the shareable poster draws one: an image
 * forwarded through WhatsApp is exactly where a QR earns its place, since the
 * person receiving it cannot tap a link that is baked into a picture.
 *
 * The URL points at `/r/[code]` rather than straight at the store, so the
 * click is counted and the device decides what it gets.
 */
export async function ReferralLinkCard({
  code,
  siteUrl,
  firstName,
}: {
  code: string;
  siteUrl: string;
  /** Goes on the shareable card: "Priya is on DailyMattr — join them". */
  firstName: string;
}) {
  const link = `${siteUrl.replace(/\/$/, "")}/r/${code}`;

  // Error-correction level M: a QR printed on a poster picks up scuffs and
  // fingerprints, and M recovers ~15% of the symbol at a modest size cost.
  const svg = await QRCode.toString(link, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });

  // base64 rather than a raw data URL: an SVG full of `#` and `<` characters
  // has to be escaped either way, and base64 is the encoding that survives
  // every browser's image loader.
  const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const logoDataUrl = `data:image/svg+xml;base64,${Buffer.from(
    wordmarkSvg("#ffffff"),
  ).toString("base64")}`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold tracking-widest text-brand-strong uppercase">
          Your link
        </p>
        <p className="mt-2 truncate font-mono text-[13.5px] font-bold text-gray-900">
          {link}
        </p>
        <p className="mt-2 text-[12.5px] font-semibold text-gray-500">
          Opens the Play Store on Android and counts the click. The app is
          Android-only for now, so iPhone taps are counted and told that.
        </p>

        <div className="mt-4 flex">
          <InstallCard
            code={code}
            link={link}
            name={firstName}
            qrDataUrl={qrDataUrl}
            logoDataUrl={logoDataUrl}
          />
        </div>

        <div className="mt-3 flex">
          <CopyButton
            value={link}
            label="Copy link"
            copiedLabel="Link copied!"
            toastMessage="Referral link copied to clipboard"
            className="rounded-xl border-0 bg-brand-strong px-6 py-2.5 text-xs font-extrabold tracking-wide text-white uppercase shadow-xs transition-all hover:bg-brand-press"
          />
        </div>
      </div>
    </div>
  );
}
