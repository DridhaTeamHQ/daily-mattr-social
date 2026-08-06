import { Card, CardBody } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";

/**
 * The deal, written down where the money is.
 *
 * These numbers were on a slide and in the database and nowhere a student
 * could read them. Somebody deciding whether to chase two more downloads
 * tonight needs to know that fifty of them is ₹500, and somebody who has
 * shared three survey links needs to know that a link with four responses on
 * it does not count yet.
 *
 * Their own progress sits against each line rather than beside it in a
 * separate card, because "30 downloads a month" and "you have 12" are one
 * sentence and reading them apart is how people mis-plan their week.
 */
export function ProgrammeTerms({
  terms,
  progress,
}: {
  terms: {
    downloads: number;
    surveys: number;
    responsesPerSurvey: number;
    amountInr: number;
    bonusPerDownloads: number;
    bonusInr: number;
    activeDays: number;
    activityWindow: number;
  };
  /** This month so far. Omitted on screens that only need the terms. */
  progress?: {
    downloads: number;
    qualifyingSurveys: number;
    activeDays: number;
    bonusInr: number;
    totalInr: number;
    met: boolean;
  };
}) {
  const rows = [
    {
      target: formatNumber(terms.downloads),
      label: "verified app downloads per month",
      have: progress?.downloads,
      done: progress ? progress.downloads >= terms.downloads : undefined,
    },
    {
      target: `${terms.surveys}+`,
      label: "feedback surveys every month",
      have: progress?.qualifyingSurveys,
      done: progress
        ? progress.qualifyingSurveys >= terms.surveys
        : undefined,
    },
    {
      target: formatNumber(terms.responsesPerSurvey),
      label: "responses on each survey for it to count",
    },
    {
      target: `₹${formatNumber(terms.bonusInr)}`,
      label: `for every extra ${terms.bonusPerDownloads} downloads past the target`,
      have: progress && progress.bonusInr > 0 ? progress.bonusInr : undefined,
      prefix: "₹",
    },
    {
      target: `${terms.activeDays} of ${terms.activityWindow}`,
      label: "days on the app — quieter than that and we check in",
      have: progress?.activeDays,
      done: progress ? progress.activeDays >= terms.activeDays : undefined,
    },
  ];

  return (
    <Card>
      <CardBody>
        <h2 className="display text-[16px] text-ink">How the stipend works</h2>
        <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
          Hit the monthly targets and the stipend is yours. Everything past
          them pays on top.
        </p>

        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-baseline gap-3 rounded-lg bg-canvas-sunk px-3.5 py-2.5"
            >
              <span className="tabular w-[70px] shrink-0 text-right text-[15px] font-black text-brand-strong">
                {row.target}
              </span>
              <span className="flex-1 text-[13px] leading-snug font-semibold text-ink">
                {row.label}
              </span>
              {row.have !== undefined && (
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
                  {row.prefix ?? ""}
                  {formatNumber(row.have)} so far
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
              ? `On track this month — ₹${formatNumber(progress.totalInr)} once the month closes.`
              : "Not there yet this month. The targets reset on the first."}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
