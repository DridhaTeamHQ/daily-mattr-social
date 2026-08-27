import { Lock, Smartphone } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { ShareReferralButton } from "@/components/share-referral";

/**
 * The share link, split by the store it can actually reach.
 *
 * One link used to sit under "sends Android to the Play Store and iPhone to
 * the App Store", which was a promise the programme could not keep — there is
 * no iOS build, so half that sentence pointed at a listing that 404s. A student
 * reading it had no way to know the friend they sent it to might get nothing.
 *
 * So the two platforms are two sections, and the one that does not work says
 * so. An ambassador can see at a glance who their link is worth sending to,
 * which is the thing they are deciding when they look at this page.
 *
 * ─── Why this shares the store listing, not `/<code>` ───────────────────────
 *
 * It shares the Play Store URL directly. The tracked `/<code>` redirect still
 * exists and still works for every link already out in the world, but it is no
 * longer what this panel hands out.
 *
 * The trade is deliberate and worth knowing: nothing new is written to
 * `referral_clicks`, so the click half of the funnel stops growing. Credit is
 * unaffected — a referral is counted when the friend types the code into the
 * app, never from the click — and `ShareReferralButton` sends the code beside
 * the link precisely so that still happens.
 */
export function ReferralLinkCard({
  code,
  playStoreUrl,
}: {
  code: string;
  /** The store listing itself — what gets shown, shared and copied. */
  playStoreUrl: string;
}) {
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

        {/* Reads as the counterpart to the iOS panel's "coming soon" — one
            side is waiting, this side is live. */}
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
          href={playStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 block font-mono text-[13px] leading-relaxed font-bold break-all text-gray-900 hover:underline"
        >
          {playStoreUrl}
        </a>
        <p className="mt-1.5 text-[12.5px] leading-relaxed font-semibold text-gray-500">
          Share it with your friends and get them to download dailymattr from
          the Play Store. The more people you bring in, the more you progress!
        </p>

        {/* Share sends the code and the store link together, which is what
            makes this work: the link installs the app and the code is what
            credits the ambassador once it is typed in. Copy link is the one
            for pasting into something that only wants a URL. */}
        <div className="mt-4">
          <ShareReferralButton code={code} link={playStoreUrl} />
        </div>

        <div className="mt-3">
          <CopyButton
            value={playStoreUrl}
            label="Copy link"
            copiedLabel="Link copied!"
            toastMessage="Referral link copied to clipboard"
            className="rounded-xl border-0 bg-brand-strong px-6 py-2.5 text-xs font-extrabold tracking-wide text-white uppercase shadow-xs transition-all hover:bg-brand-press"
          />
        </div>
      </div>

      {/* ─── iOS: not here yet, and said as a promise rather than a refusal ── */}
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gray-200 text-gray-400">
            <Lock className="size-5" aria-label="Coming soon" />
          </div>
          <div>
            <p className="text-[13px] font-extrabold text-gray-500">iOS</p>
            <p className="text-[11px] font-extrabold tracking-wider text-gray-400 uppercase">
              Coming soon
            </p>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed font-extrabold text-gray-600">
          dailymattr is coming soon to the App Store!
        </p>
        <p className="mt-2.5 text-[12.5px] leading-relaxed font-semibold text-gray-500">
          We&apos;re working on bringing the full dailymattr experience to
          iPhone, so you can stay updated on what matters, wherever you are.
        </p>
        <p className="mt-3 text-[12.5px] leading-relaxed font-semibold text-gray-600">
          Hang tight — the iOS version is on its way!
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed font-semibold text-gray-500">
          Until then, keep catching up with dailymattr on Android.
        </p>
      </div>
    </div>
  );
}
