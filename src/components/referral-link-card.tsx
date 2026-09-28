import { Download, Smartphone } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { ShareQrButton } from "@/components/share-qr";
import { ShareReferralButton } from "@/components/share-referral";
import { qrDataUrl } from "@/lib/qr";

/**
 * The share link, one panel per store.
 *
 * Two panels rather than one link that "works everywhere": an ambassador
 * sharing into a group of iPhone users wants the App Store listing, and a
 * store link that opens the wrong store is a download lost.
 *
 * ─── Why this shares the store listing, not `/<code>` ───────────────────────
 *
 * It shares the store URLs directly. The tracked `/<code>` redirect still
 * exists and still works for every link already out in the world, but it is no
 * longer what this panel hands out.
 *
 * The trade is deliberate and worth knowing: nothing new is written to
 * `referral_clicks`, so the click half of the funnel stops growing. Credit is
 * unaffected — a referral is counted when the friend types the code into the
 * app, never from the click — and `ShareReferralButton` sends the code beside
 * the link precisely so that still happens.
 *
 * The one exception is the combined QR at the top, which does go through
 * `/<code>`: a camera pointed at a poster has no panel to choose, and the
 * redirect is the only thing that knows which store the phone wants.
 */
export async function ReferralLinkCard({
  code,
  playStoreUrl,
  appStoreUrl,
  smartLink,
}: {
  code: string;
  /** The store listings themselves — what gets shown, shared and copied. */
  playStoreUrl: string;
  appStoreUrl: string;
  /**
   * The tracked `/<code>` redirect. Only the combined QR uses it: a QR is
   * scanned by a phone whose store we cannot know in advance, and this route
   * already sends iPhones to the App Store and everything else to Play.
   */
  smartLink: string;
}) {
  const [smartQr, playQr, appQr] = await Promise.all([
    qrDataUrl(smartLink),
    qrDataUrl(playStoreUrl),
    qrDataUrl(appStoreUrl),
  ]);

  return (
    <div className="space-y-4">
      {smartQr && <CombinedQrPanel code={code} qr={smartQr} link={smartLink} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <StorePanel
          code={code}
          url={playStoreUrl}
          qr={playQr}
          platform="Android"
          store="Play Store"
          icon={<Smartphone className="size-5" aria-hidden />}
        />
        <StorePanel
          code={code}
          url={appStoreUrl}
          qr={appQr}
          platform="iOS"
          store="App Store"
          icon={<AppleLogo className="size-5" />}
          iconTile="bg-black text-white"
        />
      </div>
    </div>
  );
}

/**
 * One QR for a room full of mixed phones.
 *
 * The per-store QRs below are for when the ambassador knows which phone the
 * friend holds. This is for everything else — a poster, a stall, a slide at
 * the front of a lecture — where one code has to work for whoever points a
 * camera at it. Scans go through `/<code>`, so they are counted as clicks too.
 */
function CombinedQrPanel({
  code,
  qr,
  link,
}: {
  code: string;
  qr: string;
  link: string;
}) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
      <QrImage src={qr} alt={`QR code for ${link}`} className="size-44" />
      <div className="text-center sm:text-left">
        <p className="text-[11px] font-extrabold tracking-widest text-brand-strong uppercase">
          One QR for any phone
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed font-extrabold text-gray-900">
          Scan opens the App Store on iPhone and the Play Store on Android.
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed font-semibold text-gray-500">
          Best for posters, stalls and group chats with both kinds of phone.
          Remind them to enter your code{" "}
          <span className="font-mono font-bold text-gray-900">{code}</span>{" "}
          in the app after installing.
        </p>
        <div className="mt-4">
          <QrActions
            src={qr}
            filename={`dailymattr-${code}-qr.png`}
            code={code}
            link={link}
          />
        </div>
      </div>
    </div>
  );
}

function StorePanel({
  code,
  url,
  qr,
  platform,
  store,
  icon,
  iconTile = "bg-brand-tint text-brand-strong",
}: {
  code: string;
  url: string;
  qr: string | null;
  platform: string;
  store: string;
  icon: React.ReactNode;
  /** Background and colour of the square the icon sits in. */
  iconTile?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
      <div className="flex items-center gap-3">
        <div
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${iconTile}`}
        >
          {icon}
        </div>
        <div>
          <p className="text-[13px] font-extrabold text-gray-900">{platform}</p>
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
      {/* A real anchor, not lucide's `Link` — that one is the chain icon, and
          an icon given a `to` prop renders an SVG rather than the URL.

          `break-all` rather than `truncate`: this is the thing a student
          copies by eye when the button will not paste into an app, and half
          a link with an ellipsis on the end cannot be typed out. */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 block font-mono text-[13px] leading-relaxed font-bold break-all text-gray-900 hover:underline"
      >
        {url}
      </a>
      <p className="mt-1.5 text-[12.5px] leading-relaxed font-semibold text-gray-500">
        Share it with your friends and get them to download dailymattr from
        the {store}. The more people you bring in, the more you progress!
      </p>

      {qr && (
        <div className="mt-4 flex items-center gap-4">
          <QrImage
            src={qr}
            alt={`QR code for the ${store} listing`}
            className="size-28"
          />
          <p className="text-[12px] leading-relaxed font-semibold text-gray-500">
            Scan with an {platform === "iOS" ? "iPhone" : "Android phone"} to
            open the {store}. Share below sends this QR with your code and
            link.
          </p>
        </div>
      )}

      {/* Share sends the code and the store link together, which is what
          makes this work: the link installs the app and the code is what
          credits the ambassador once it is typed in. Copy link is the one
          for pasting into something that only wants a URL. */}
      <div className="mt-4">
        <ShareReferralButton
          code={code}
          link={url}
          qr={qr}
          qrFilename={`dailymattr-${code}-${platform.toLowerCase()}-qr.png`}
        />
      </div>

      <div className="mt-3">
        <CopyButton
          value={url}
          label="Copy link"
          copiedLabel="Link copied!"
          toastMessage={`${platform} link copied to clipboard`}
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

const QR_BUTTON =
  "inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-extrabold tracking-wide text-gray-900 uppercase shadow-xs transition-all hover:bg-gray-50";

/**
 * The same PNG, shared straight into a chat or saved — for a poster, a story
 * or a printed card. The link passed in is the one the QR encodes, so the
 * caption and the picture always point at the same place.
 */
function QrActions({
  src,
  filename,
  code,
  link,
}: {
  src: string;
  filename: string;
  code: string;
  link: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ShareQrButton
        src={src}
        filename={filename}
        code={code}
        link={link}
        className={QR_BUTTON}
      />
      <a href={src} download={filename} className={QR_BUTTON}>
        <Download className="size-3.5" aria-hidden />
        Download QR
      </a>
    </div>
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
