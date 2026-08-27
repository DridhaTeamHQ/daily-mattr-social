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
 */
export function ReferralLinkCard({
  code,
  siteUrl,
}: {
  code: string;
  siteUrl: string;
}) {
  const link = `${siteUrl.replace(/\/$/, "")}/r/${code}`;

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
        {/* Share sends the code and the link together; Copy link is the one
            for pasting into something that only wants a URL. */}
        <div className="mt-4">
          <ShareReferralButton code={code} link={link} />
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
        <p className="mt-3 text-[12.5px] leading-relaxed font-extrabold text-gray-600">
          Hang tight — the iOS version is on its way!
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed font-semibold text-gray-500">
          Until then, keep catching up with dailymattr on Android.
        </p>
      </div>
    </div>
  );
}
