import { Smartphone } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { ShareReferralButton } from "@/components/share-referral";

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
 */
export function ReferralLinkCard({
  code,
  playStoreUrl,
  appStoreUrl,
}: {
  code: string;
  /** The store listings themselves — what gets shown, shared and copied. */
  playStoreUrl: string;
  appStoreUrl: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StorePanel
        code={code}
        url={playStoreUrl}
        platform="Android"
        store="Play Store"
        icon={<Smartphone className="size-5" aria-hidden />}
      />
      <StorePanel
        code={code}
        url={appStoreUrl}
        platform="iOS"
        store="App Store"
        icon={<AppleLogo className="size-5" />}
        iconTile="bg-black text-white"
      />
    </div>
  );
}

function StorePanel({
  code,
  url,
  platform,
  store,
  icon,
  iconTile = "bg-brand-tint text-brand-strong",
}: {
  code: string;
  url: string;
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

      {/* Share sends the code and the store link together, which is what
          makes this work: the link installs the app and the code is what
          credits the ambassador once it is typed in. Copy link is the one
          for pasting into something that only wants a URL. */}
      <div className="mt-4">
        <ShareReferralButton code={code} link={url} />
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
