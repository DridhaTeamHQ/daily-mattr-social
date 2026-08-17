import { Card, CardBody } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";

export function ProgrammeTerms({
  terms,
  progress,
}: {
  terms: {
    amountInr: number;
    activeDays: number;
    activityWindow: number;
  };
  progress?: {
    completionPct: number;
    approvedTasks: number;
    totalTasks: number;
    activeDays: number;
    totalInr: number;
    met: boolean;
  };
}) {
  const rows = [
    {
      target: "approved / total",
      label: "your monthly task-completion formula",
      haveText: progress
        ? `${formatNumber(progress.approvedTasks)}/${formatNumber(progress.totalTasks)} this month`
        : undefined,
    },
    {
      target: `${terms.activeDays} of ${terms.activityWindow}`,
      label: "days on the app",
      haveText: progress ? `${formatNumber(progress.activeDays)} days so far` : undefined,
      done: progress ? progress.activeDays >= terms.activeDays : undefined,
    },
  ];

  return (
    <Card>
      <CardBody>
        <h2 className="display text-[16px] text-ink">Monthly progress</h2>
        <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
          Stay active and complete your assigned tasks. Your monthly status is updated at the end of the month.
        </p>

        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.label} className="flex items-baseline gap-3 rounded-lg bg-canvas-sunk px-3.5 py-2.5">
              <span className="tabular w-[88px] shrink-0 text-right text-[15px] font-black text-brand-strong">{row.target}</span>
              <span className="flex-1 text-[13px] font-semibold leading-snug text-ink">{row.label}</span>
              {row.haveText && (
                <span className={cn("tabular shrink-0 text-[12.5px] font-extrabold", row.done === true ? "text-ok" : "text-ink-soft")}>
                  {row.haveText}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-brand-strong px-3.5 py-3 text-white">
          <span className="text-[13px] font-bold">Monthly stipend</span>
          <span className="tabular text-[19px] font-black">Rs {formatNumber(terms.amountInr)}</span>
        </div>

        {progress && (
          <p className="mt-2 text-[12.5px] font-semibold text-ink-soft">
            {progress.met
              ? `Monthly status updated. Rs ${formatNumber(progress.totalInr)} is scheduled after the month closes.`
              : "Keep your task completion moving through the month."}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
