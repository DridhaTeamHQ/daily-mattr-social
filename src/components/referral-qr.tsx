import QRCode from "qrcode";

import { CopyButton } from "@/components/copy-button";

/**
 * The shareable referral link, as a link and as a QR code.
 *
 * Rendered on the server as inline SVG rather than a canvas or a data-URL
 * image: it costs no client JavaScript, stays sharp when someone's friend
 * points a camera at a phone screen held at an angle, and needs no network
 * request, which matters when this is shown at a campus stall on college wifi.
 *
 * The URL points at `/r/[code]` rather than straight at the store, so the
 * click is counted and the right store is chosen from the device.
 */
export async function ReferralQr({
  code,
  siteUrl,
}: {
  code: string;
  siteUrl: string;
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

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <div
          aria-hidden
          className="size-36 shrink-0 rounded-xl border border-gray-200 bg-white p-2 [&>svg]:size-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[11px] font-extrabold tracking-widest text-brand-strong uppercase">
            Your link
          </p>
          <p className="mt-2 truncate font-mono text-[13.5px] font-bold text-gray-900">
            {link}
          </p>
          <p className="mt-2 text-[12.5px] font-semibold text-gray-500">
            Sends Android to the Play Store and iPhone to the App Store, and
            counts the click either way.
          </p>

          <div className="mt-4 flex justify-center sm:justify-start">
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
    </div>
  );
}
