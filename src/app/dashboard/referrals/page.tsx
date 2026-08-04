import { redirect } from "next/navigation";
import { Gift, Download, Calendar, Star } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Note } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { getDashboard } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const data = await getDashboard();
  if (!data) redirect("/login");

  const { referrals } = data;

  return (
    <div className="stagger space-y-6">
      {/* Header Banner - Soft Light Blue */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/90 via-blue-50/40 to-white p-6 sm:p-7 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Gift className="size-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wide text-gray-900">
                Referrals
              </h1>
              <p className="mt-1 text-xs sm:text-sm font-semibold text-gray-600">
                Share your code and earn bonus points for every app download.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Referral Code Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-8 sm:p-10 text-center shadow-xs space-y-6">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-blue-50 text-blue-600 border border-blue-100">
            Your Referral Code
          </span>
          <div className="mt-5">
            <p className="inline-block rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 px-8 sm:px-12 py-4 sm:py-5 font-mono text-3xl sm:text-4xl font-black tracking-[0.25em] text-gray-900 shadow-2xs">
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
            className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wide border-0 shadow-xs rounded-xl px-7 py-3 transition-all"
          />
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs flex items-center gap-5 relative">
          {referrals.last_conversion && (
            <div className="absolute top-4 right-4 rounded-lg border border-gray-200 bg-gray-50 p-1.5 text-gray-400">
              <Calendar className="size-4" />
            </div>
          )}
          <div className="size-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
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

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs flex items-center gap-5">
          <div className="size-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Star className="size-6 fill-current text-amber-400" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
              Points Earned
            </p>
            <h3 className="text-3xl font-black text-black tracking-tight mt-0.5">
              {referrals.points_earned}
            </h3>
            <p className="text-xs font-semibold text-blue-600 mt-0.5">
              Total Bonus Points
            </p>
          </div>
        </div>
      </div>

      {/* Info Note - Soft Light Blue */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-blue-900 text-xs sm:text-sm font-semibold leading-relaxed flex items-start gap-3">
        <div className="size-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
          i
        </div>
        <div>
          <strong className="font-extrabold text-blue-950 block mb-0.5">How referrals work:</strong>
          A referral is credited once the person installs the DailyMattr app and enters your code. Confirmations are imported in batches, so a download today may take a day or two to appear here.
        </div>
      </div>
    </div>
  );
}
