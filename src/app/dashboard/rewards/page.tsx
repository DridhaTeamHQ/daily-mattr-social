import { redirect } from "next/navigation";
import { BadgeIndianRupee, CheckCircle2 } from "lucide-react";

import { ProgrammeTerms } from "@/components/programme-terms";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/ui/stat";
import { getDashboard } from "@/lib/queries";
import { getStipendProgress } from "@/lib/rewards";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Stipend progress" };

export default async function RewardsPage() {
  const [dashboard, stipend] = await Promise.all([getDashboard(), getStipendProgress()]);
  if (!dashboard) redirect("/login?next=/dashboard/rewards");

  const month = stipend.current;
  const met = month?.met ?? false;

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={BadgeIndianRupee}
        tone="brand"
        title="Stipend progress"
        description="Your monthly stipend is based on approved-task completion."
        variant="outline"
        className="border-gray-200 bg-gray-50"
      />

      {/* Two tiles, no captions. The approved/total count was on all three of
          them — as the headline of one and the caption of another — and the
          panel below repeats it a third time as the formula it feeds. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat
          label="Completion"
          value={`${formatNumber(month?.completionPct ?? 0)}%`}
          icon={CheckCircle2}
          tone="rank"
        />
        <Stat
          label="Stipend"
          value={met ? `Rs ${formatNumber(stipend.thresholds.amountInr)}` : "-"}
          icon={BadgeIndianRupee}
          tone="invite"
        />
      </div>

      <ProgrammeTerms
        terms={stipend.thresholds}
        progress={
          month
            ? {
                completionPct: month.completionPct,
                approvedTasks: month.approvedTasks,
                totalTasks: month.totalTasks,
                activeDays: stipend.activeDays,
                totalInr: month.totalInr,
                met: month.met,
              }
            : undefined
        }
      />
    </div>
  );
}
