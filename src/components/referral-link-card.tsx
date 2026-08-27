import QRCode from "qrcode";
import { Lock, Smartphone } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { InstallCard } from "@/components/install-card";
import { wordmarkSvg } from "@/components/logo";

/**
 * The share link, split by the store it can actually reach.
 *
 * One link used to sit here over the line "sends Android to the Play Store and
 * iPhone to the App Store", which was a promise the programme could not keep —
 * there is no iOS build, so half of that sentence pointed at a listing that
 * 404s. A student reading it had no way to know that the friend they sent it
 * to might get nothing.
 *
 * So the two platforms are two sections, and the one that does not work says
 * so. An ambassador can see at a glance who their link is worth sending to,
 * which is the thing they are deciding when they look at this page.
 *
 * The QR is off the page while the app is Android-only — a code pointed at a
 * screen is a stall-and-poster tool, and there is no stall to run until both
 * halves of a crowd can install. It is still generated here, because the
 * shareable poster draws one: an image forwarded through WhatsApp is exactly
 * where a QR earns its place, since a picture has no link to tap.
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
    <div className="grid gap-4 sm:grid-cols-2">
      {/* ─── Android: the one that works ──────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-strong">
            <Smartphone className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-[13px] font-extrabold text-gray-900">Android</p>
            <p className="text-[11px] font-extrabold tracking-wider text-ok uppercase">
              Ready to share
            </p>
          </div>
        </div>

        <p className="mt-4 text-[11px] font-extrabold tracking-widest text-brand-strong uppercase">
          Your link
        </p>
        {/* `break-all` rather than `truncate`: this is the thing a student
            copies by eye when the button will not paste into an app, and half
            a link with an ellipsis on the end cannot be typed out. */}
        <p className="mt-1.5 font-mono text-[13px] leading-relaxed font-bold break-all text-gray-900">
          {link}
        </p>
        <p className="mt-2 text-[12.5px] font-semibold text-gray-500">
          Opens the Play Store and counts the click.
        </p>

        <div className="mt-4">
          <InstallCard
            code={code}
            link={link}
            name={firstName}
            qrDataUrl={qrDataUrl}
            logoDataUrl={logoDataUrl}
          />
        </div>

        <div className="mt-3">
          <CopyButton
            value={link}
            label="Copy link"
            copiedLabel="Link copied!"
            toastMessage="Referral link copied to clipboard"
            className="rounded-xl border-0 bg-brand-strong px-6 py-2.5 text-xs font-extrabold tracking-wide text-white uppercase shadow-xs transition-all hover:bg-brand-press"
          />
        </div>
      </div>

      {/* ─── iPhone: locked, and honest about why ─────────────────────────── */}
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gray-200 text-gray-400">
            <Lock className="size-5" aria-label="Locked" />
          </div>
          <div>
            <p className="text-[13px] font-extrabold text-gray-500">iPhone</p>
            <p className="text-[11px] font-extrabold tracking-wider text-gray-400 uppercase">
              Not available yet
            </p>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed font-semibold text-gray-500">
          DailyMattr isn&apos;t on the App Store yet, so there is no iPhone link
          to share.
        </p>
        {/* What happens anyway, said plainly. A student who does not know this
            reads a silent locked box as "do not send my link to iPhone
            friends", when the truth is closer to "you can, and they will be
            told to wait" — and the click still counts toward their number. */}
        <p className="mt-2.5 text-[12.5px] leading-relaxed font-semibold text-gray-400">
          Send your link to an iPhone friend anyway and they&apos;ll see a note
          explaining it&apos;s Android-only for now. The tap is still counted,
          and your code still works for them when it launches.
        </p>
      </div>
    </div>
  );
}
