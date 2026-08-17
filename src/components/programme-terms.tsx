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

        {/* A table rather than stacked rows: these are two of the same kind of
            thing — a target, what it is, and where you are against it — and
            columns are what let you read down one of those rather than across
            each row separately. */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left">
            <thead>
              <tr className="text-[11px] font-bold tracking-wide text-ink-faint uppercase">
                <th className="py-2 pr-3 font-bold">Target</th>
                <th className="py-2 pr-3 font-bold">What it measures</th>
                <th className="py-2 text-right font-bold">You</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="tabular py-3 pr-3 text-[15px] font-black whitespace-nowrap text-brand-strong">
                    {row.target}
                  </td>
                  <td className="py-3 pr-3 text-[13px] leading-snug font-semibold text-ink">
                    {row.label}
                  </td>
                  <td
                    className={cn(
                      "tabular py-3 text-right text-[12.5px] font-extrabold whitespace-nowrap",
                      row.done === true ? "text-ok" : "text-ink-soft",
                    )}
                  >
                    {row.haveText ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
