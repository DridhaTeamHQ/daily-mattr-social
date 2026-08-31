import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar, Download, Gift, Lock } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { ReferralLinkCard } from "@/components/referral-link-card";
import { Button } from "@/components/ui/button";
import { getDashboard } from "@/lib/queries";
import { getTextSetting, getUnlockAt, isUnlocked } from "@/lib/settings";
import { formatDate } from "@/lib/utils";

/** Only until the setting is filled in — the same default the redirect uses. */
const PLAY_STORE_FALLBACK =
  "https://play.google.com/store/apps/details?id=com.dailymattr";

export const metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const data = await getDashboard();
  if (!data) redirect("/login");

  const { referrals } = data;

  // Read rather than hard-coded, so the store listing can be corrected without
  // a deploy — and so this and `/[code]` can never disagree about where the
  // app lives.
  const playStoreUrl = await getTextSetting(
    "play_store_url",
    PLAY_STORE_FALLBACK,
  );

  // The link card is finished and switched off until the app is live in the
  // store. `referral_link_unlock_at` in app_settings decides — see getUnlockAt.
  // Checked per request, and this page is already dynamic, so the card opens on
  // the next load after the date passes with nothing to deploy.
  const linkUnlockAt = await getUnlockAt("referral_link_unlock_at");
  const linkOpen = isUnlocked(linkUnlockAt);

  return (
    <div className="stagger space-y-6">
      {/* Header Banner - Soft Light Blue */}
      <div className="rounded-2xl border border-brand/20 bg-gradient-to-r from-brand-tint/90 via-brand-tint/40 to-white p-6 sm:p-7 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-xl bg-brand-strong flex items-center justify-center text-white shadow-xs shrink-0">
              <Gift className="size-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wide text-gray-900">
                Referrals
              </h1>
              <p className="mt-1 text-xs sm:text-sm font-semibold text-gray-600">
                Share your code and help grow the DailyMattr community.
              </p>
            </div>
          </div>

          <Button asChild variant="outline-blue" className="shrink-0">
            <Link href="/dashboard/rewards">
              View stipend progress
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Referral Code Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-8 sm:p-10 text-center shadow-xs space-y-6">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-brand-tint text-brand-strong border border-brand/20">
            Your Referral Code
          </span>
          <div className="mt-5">
            <p className="inline-block rounded-2xl border-2 border-dashed border-brand/35 bg-brand-tint/40 px-8 sm:px-12 py-4 sm:py-5 font-mono text-3xl sm:text-4xl font-black tracking-[0.25em] text-gray-900 shadow-2xs">
              {referrals.code}
            </p>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <CopyButton
            value={referrals.code}
            label="Copy Code"
            copiedLabel="Code Copied!"
            toastMessage="Referral code copied to clipboard"
            className="bg-brand-strong hover:bg-brand-press text-white font-extrabold text-xs uppercase tracking-wide border-0 shadow-xs rounded-xl px-7 py-3 transition-all"
          />
        </div>
      </div>

      {/* The link and the shareable card. `/r/<code>` counts the click on the
          way through and sends Android to the Play Store.

          Locked rather than deleted, and said out loud rather than left blank:
          a card that simply vanished would read as something that failed to
          load. The code above still works while this is shut, and the copy
          says so — a student reading "not open yet" needs to know they have
          not been left with nothing to share. */}
      {linkOpen ? (
        <ReferralLinkCard
          code={referrals.code}
          playStoreUrl={playStoreUrl}
        />
      ) : (
        <div className="flex items-center gap-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-400">
            <Lock className="size-5" aria-label="Locked" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold tracking-wider text-gray-500 uppercase">
              Your link
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-gray-500 sm:text-sm">
              {/* Naming the date when there is one. "Opens soon" with no date
                  is the kind of promise students stop believing the second
                  time they read it. */}
              {linkUnlockAt
                ? `Share links open on ${formatDate(linkUnlockAt)}.`
                : "Share links are not open yet."}{" "}
              Your code above still works — pass that on and it will be
              credited the same way.
            </p>
          </div>
        </div>
      )}

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs relative">
          {referrals.last_conversion && (
            <div className="absolute top-4 right-4 rounded-lg border border-gray-200 bg-gray-50 p-1.5 text-gray-400">
              <Calendar className="size-4" />
            </div>
          )}

          <div className="flex items-center gap-5">
            <div className="size-12 rounded-xl bg-brand-tint border border-brand/20 flex items-center justify-center text-brand-strong shrink-0">
              <Download className="size-6" />
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                Confirmed Downloads
              </p>
              <h3 className="text-3xl font-black text-black tracking-tight mt-0.5">
                {referrals.total_confirmed}
              </h3>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">
                {referrals.last_conversion
                  ? `Last on ${formatDate(referrals.last_conversion)}`
                  : "No downloads yet"}
              </p>
            </div>
          </div>

          {/* On the number itself, not only in the note at the foot of the
              page: this is the figure people come here to check, and somebody
              who shared their code an hour ago is counting today's installs
              against a total that cannot hold them yet. */}
          <p className="mt-4 rounded-xl border border-brand/20 bg-brand-tint/60 px-4 py-3 text-xs font-semibold leading-relaxed text-brand-press">
            Installs take up to 24 hrs to show up. Got a new download? Give it
            a little time - it&rsquo;ll be counted! 💛
          </p>
        </div>

      </div>

      {/* Info Note - Soft Light Blue */}
      <div className="rounded-2xl border border-brand/20 bg-brand-tint/60 p-5 text-brand-press text-xs sm:text-sm font-semibold leading-relaxed flex items-start gap-3">
        <div className="size-6 rounded-full bg-brand-strong text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
          i
        </div>
        <div>
          <strong className="font-extrabold text-brand-press block mb-0.5">How referrals work:</strong>
          A referral is credited once the person installs the dailymattr app and enters your code. Confirmations are imported in batches, so a download today may take a day or two to appear here.
        </div>
      </div>
    </div>
  );
}
