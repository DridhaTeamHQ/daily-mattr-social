import { redirect } from "next/navigation";
import { Gift } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
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
    <div className="space-y-5">
      <h1 className="text-[19px] font-semibold tracking-tight text-ink">
        Referrals
      </h1>

      <Card>
        <CardBody className="text-center">
          <p className="text-[13px] font-medium text-ink-soft">
            Your referral code
          </p>

          {/* Wide tracking because students read this aloud and type it by
              hand. The alphabet already excludes 0/O/1/I/L/U. */}
          <p className="mt-2 font-mono text-[34px] font-semibold tracking-[0.18em] text-ink">
            {referrals.code}
          </p>

          <div className="mt-5 flex justify-center">
            <CopyButton
              value={referrals.code}
              label="Copy code"
              copiedLabel="Code copied"
              toastMessage="Referral code copied"
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Confirmed downloads"
          value={referrals.total_confirmed}
          sub={
            referrals.last_conversion
              ? `Last on ${formatDate(referrals.last_conversion)}`
              : "None yet"
          }
          icon={Gift}
        />
        <Stat label="Points earned" value={referrals.points_earned} />
      </div>

      <Note tone="neutral" title="How this counts">
        A referral is credited once the person installs the DailyMattr app and
        enters your code. Confirmations are imported in batches, so a download
        today may take a day or two to appear here.
      </Note>
    </div>
  );
}
