import { Smartphone } from "lucide-react";

import {
  CopyReferralButton,
  ShareReferralButton,
} from "@/components/share-referral";
import { qrDataUrl } from "@/lib/qr";

/**
 * The share link: one link, one QR, for any phone.
 *
 * It hands out the ambassador's own `/<code>`, which counts the click and then
 * decides on the phone doing the opening — iPhones and iPads go to the App
 * Store, Android to Play (see `download-page`). So an ambassador never has to
 * know which phone a friend holds, and an Android student posting into a
 * group still sends its iPhones to the right store.
 *
 * The code is in the link, but credit still comes from the friend typing it
 * into the app — the link only counts the click — which is why
 * `ShareReferralButton` sends the code in the message as well.
 */
export async function ReferralLinkCard({
  code,
  shareLink,
}: {
  code: string;
  /** `/<code>` on this site — what gets shown, shared, copied and scanned. */
  shareLink: string;
}) {
  const qr = await qrDataUrl(shareLink);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 -space-x-2">
          <div className="grid size-10 place-items-center rounded-xl bg-brand-tint text-brand-strong ring-2 ring-white">
            <Smartphone className="size-5" aria-hidden />
          </div>
          <div className="grid size-10 place-items-center rounded-xl bg-black text-white ring-2 ring-white">
            <AppleLogo className="size-5" />
          </div>
        </div>
        <div>
          <p className="text-[13px] font-extrabold text-gray-900">
            Android &amp; iOS
          </p>
          <p className="text-[11px] font-extrabold tracking-wider text-ok uppercase">
            Ready to share
          </p>
        </div>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed font-extrabold text-gray-900">
        Your referral link is live!
      </p>
      <p className="mt-4 text-[11px] font-extrabold tracking-widest text-brand-strong uppercase">
        Your link
      </p>
      {/* A real anchor, and `break-all` rather than `truncate`: this is the
          thing a student copies by eye when the button will not paste into an
          app, and half a link with an ellipsis on the end cannot be typed. */}
      <a
        href={shareLink}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 block font-mono text-[13px] leading-relaxed font-bold break-all text-gray-900 hover:underline"
      >
        {shareLink}
      </a>
      <p className="mt-1.5 text-[12.5px] leading-relaxed font-semibold text-gray-500">
        One link for everyone — it opens the App Store on iPhone and the Play
        Store on Android. Remind friends to enter your code{" "}
        <span className="font-mono font-bold text-gray-900">{code}</span> in
        the app after installing. The more people you bring in, the more you
        progress!
      </p>

      {qr && (
        <div className="mt-4 flex items-center gap-4">
          <QrImage
            src={qr}
            alt={`QR code for ${shareLink}`}
            className="size-28"
          />
          <p className="text-[12px] leading-relaxed font-semibold text-gray-500">
            Scan with any phone to open the right store. Share below sends this
            QR with your code and link.
          </p>
        </div>
      )}

      <div className="mt-4">
        <ShareReferralButton
          code={code}
          link={shareLink}
          qr={qr}
          qrFilename={`dailymattr-${code}-qr.png`}
        />
      </div>

      <div className="mt-3">
        <CopyReferralButton
          code={code}
          link={shareLink}
          qr={qr}
          qrFilename={`dailymattr-${code}-qr.png`}
          className="rounded-xl border-0 bg-brand-strong px-6 py-2.5 text-xs font-extrabold tracking-wide text-white uppercase shadow-xs transition-all hover:bg-brand-press"
        />
      </div>
    </div>
  );
}

/**
 * A plain `<img>`, not `next/image`: the source is a data URL drawn for this
 * request, so there is nothing for the optimiser to fetch or cache.
 *
 * `rendering: pixelated` keeps the modules sharp when the browser scales the
 * PNG — a blurred QR is one a cheap phone camera gives up on.
 */
function QrImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`shrink-0 rounded-xl border border-gray-200 bg-white [image-rendering:pixelated] ${className ?? ""}`}
    />
  );
}

/**
 * The Apple mark. Lucide's `Apple` is the fruit, and next to "iOS" it reads
 * as a grocery icon rather than the platform. Path from Simple Icons (CC0).
 */
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}
