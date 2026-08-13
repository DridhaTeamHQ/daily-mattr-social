import { Card, CardBody } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";

export function ProgrammeTerms({
  terms,
  progress,
}: {
  terms: {
    completionPct: number;
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
      target: `${formatNumber(terms.completionPct)}%`,
      label: "approved task completion needed this month",
      haveText: progress ? `${formatNumber(progress.completionPct)}% so far` : undefined,
      done: progress
        ? progress.totalTasks > 0 && progress.completionPct >= terms.completionPct
        : undefined,
    },
    {
      target: "approved / total",
      label: "formula used for the stipend percentage",
      haveText: progress
        ? `${formatNumber(progress.approvedTasks)}/${formatNumber(progress.totalTasks)} this month`
        : undefined,
    },
    {
      target: `${terms.activeDays} of ${terms.activityWindow}`,
      label: "days on the app — quieter than that and we check in",
      haveText:
        progress !== undefined
          ? `${formatNumber(progress.activeDays)} days so far`
          : undefined,
      done: progress ? progress.activeDays >= terms.activeDays : undefined,
    },
  ];

  return (
    <Card>
      <CardBody>
        <h2 className="display text-[16px] text-ink">How the stipend works</h2>
        <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
          Get at least {formatNumber(terms.completionPct)}% of this month's
          assigned tasks approved and the stipend is yours.
        </p>

        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-baseline gap-3 rounded-lg bg-canvas-sunk px-3.5 py-2.5"
            >
              <span className="tabular w-[88px] shrink-0 text-right text-[15px] font-black text-brand-strong">
                {row.target}
              </span>
              <span className="flex-1 text-[13px] leading-snug font-semibold text-ink">
                {row.label}
              </span>
              {row.haveText && (
                <span
                  className={cn(
                    "tabular shrink-0 text-[12.5px] font-extrabold",
                    row.done === true
                      ? "text-ok"
                      : row.done === false
                        ? "text-ink-soft"
                        : "text-ok",
                  )}
                >
                  {row.haveText}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-brand-strong px-3.5 py-3 text-white">
          <span className="text-[13px] font-bold">Monthly stipend</span>
          <span className="tabular text-[19px] font-black">
            ₹{formatNumber(terms.amountInr)}
          </span>
        </div>

        {progress && (
          <p className="mt-2 text-[12.5px] font-semibold text-ink-soft">
            {progress.met
              ? `Eligible this month — ₹${formatNumber(progress.totalInr)} once the month closes.`
              : "Not there yet this month. Cross the completion line before the month closes."}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
