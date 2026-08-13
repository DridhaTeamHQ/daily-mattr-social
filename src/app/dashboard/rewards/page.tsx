import { redirect } from "next/navigation";
import { BadgeIndianRupee, CheckCircle2, ClipboardCheck, Wallet } from "lucide-react";

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Completion"
          value={`${formatNumber(month?.completionPct ?? 0)}%`}
          sub={month?.totalTasks ? `${formatNumber(month.approvedTasks)}/${formatNumber(month.totalTasks)} tasks approved` : "No tasks assigned this month"}
          icon={CheckCircle2}
          tone="rank"
        />
        <Stat
          label="Approved tasks"
          value={month ? `${formatNumber(month.approvedTasks)}/${formatNumber(month.totalTasks)}` : "0/0"}
          sub="Approved or auto-approved"
          icon={ClipboardCheck}
          tone="poll"
        />
        <Stat
          label="Stipend line"
          value={`${formatNumber(stipend.thresholds.completionPct)}%`}
          sub="Minimum monthly completion"
          icon={Wallet}
          tone="brand"
        />
        <Stat
          label="Stipend"
          value={met ? `Rs ${formatNumber(stipend.thresholds.amountInr)}` : "-"}
          sub={met ? "Eligible this month" : "Complete more approved tasks"}
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
