import Link from "next/link";
import { redirect } from "next/navigation";
import { Gift, Lock } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { getDashboard } from "@/lib/queries";

export const metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const data = await getDashboard();
  if (!data) redirect("/login");

  const { referrals } = data;

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

      {/* The link, the QR and the share card are locked for now. Restoring
          them is putting <ReferralQr code siteUrl firstName /> back here — the
          component and the /r/<code> route are untouched. Locked rather than
          deleted, and said out loud rather than left blank: a card that simply
          vanished would read as something that failed to load. */}
      <div className="flex items-center gap-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-xs">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-400">
          <Lock className="size-5" aria-label="Locked" />
        </div>
        <div>
          <p className="text-[11px] font-extrabold tracking-wider text-gray-500 uppercase">
            Your link
          </p>
          <p className="mt-0.5 text-[13px] font-semibold text-gray-500 sm:text-sm">
            Share links and QR codes are not open yet. Your code above still
            works — pass that on and it will be credited the same way.
          </p>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 gap-4">
        {/* Locked like the link above it: same grey padlock in place of the
            icon, same muted treatment. The count itself still shows — locked
            means "not open to you yet", not "hidden", and a tile that went
            blank would read as something that failed to load. */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs flex items-center gap-5 relative">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-400">
            <Lock className="size-5" aria-label="Locked" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
              Confirmed Downloads
            </p>
            <h3 className="text-3xl font-black text-gray-400 tracking-tight mt-0.5">
              {referrals.total_confirmed}
            </h3>
            <p className="text-xs font-semibold text-gray-500 mt-0.5">
              Download tracking is not open yet.
            </p>
          </div>
        </div>

      </div>

      {/* Info Note - Soft Light Blue */}
      <div className="rounded-2xl border border-brand/20 bg-brand-tint/60 p-5 text-brand-press text-xs sm:text-sm font-semibold leading-relaxed flex items-start gap-3">
        <div className="size-6 rounded-full bg-brand-strong text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
          i
        </div>
        <div>
          <strong className="font-extrabold text-brand-press block mb-0.5">How referrals work:</strong>
          A referral is credited once the person installs the DailyMattr app and enters your code. Confirmations are imported in batches, so a download today may take a day or two to appear here.
        </div>
      </div>
    </div>
  );
}
