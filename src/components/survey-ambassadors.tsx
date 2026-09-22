import Link from "next/link";
import { Copy, Flag, Pointer } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { SurveyAmbassador } from "@/lib/admin/participation";
import { cn, formatNumber, initials } from "@/lib/utils";

/**
 * One survey, broken down by the ambassadors carrying it.
 *
 * Split into two lists rather than one sorted table. "Nobody has clicked their
 * link" and "people clicked and did not finish" are different failures needing
 * different responses, and a single ranked list buries the first group at the
 * bottom where nobody scrolls.
 */
export function SurveyAmbassadors({ rows }: { rows: SurveyAmbassador[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Pointer}
          title="No links issued yet"
          description="Publish the survey to give every active ambassador their own link."
        />
      </Card>
    );
  }

  const collecting = rows.filter((r) => r.responses > 0);
  const quiet = rows.filter((r) => r.responses === 0);

  return (
    <div className="space-y-4">
      <Duplicates rows={rows} />

      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Collecting</h2>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
            {collecting.length} of {rows.length} ambassadors have brought in at
            least one response.
          </p>

          {collecting.length === 0 ? (
            <p className="mt-4 text-[13px] font-semibold text-ink-faint">
              Nobody yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {collecting.map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Nothing yet</h2>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
            Clicks with no responses means the survey is losing people. No
            clicks at all means the link was never shared — two different
            conversations.
          </p>

          {quiet.length === 0 ? (
            <p className="mt-4 text-[13px] font-semibold text-emerald-600">
              Everyone with a link has collected something.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {quiet.map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ row }: { row: SurveyAmbassador }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100 text-[11.5px] font-extrabold text-ink"
      >
        {initials(row.name)}
      </span>

      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/ambassadors/${row.id}`}
          className="block truncate text-[13.5px] font-bold text-ink hover:underline"
        >
          {row.name}
        </Link>
        <p className="truncate text-[12px] text-ink-soft">
          {[row.city, row.batch].filter(Boolean).join(" · ") ||
            "No city or batch set"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4 text-right">
        <Figure label="Clicks" value={formatNumber(row.clicks)} muted={row.clicks === 0} />
        <Figure
          label="Responses"
          value={formatNumber(row.responses)}
          muted={row.responses === 0}
        />
        <Figure
          label="Dupes"
          value={formatNumber(row.duplicates)}
          muted={row.duplicates === 0}
          tone={row.duplicates > 0 ? "warn" : undefined}
        />
        <Figure
          label="Rate"
          value={
            row.conversion === null ? "—" : `${Math.round(row.conversion * 100)}%`
          }
          muted={row.conversion === null}
        />
      </div>

      {row.flagged > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">
          <Flag className="size-3" />
          {row.flagged} flagged
        </span>
      )}
    </li>
  );
}

function Figure({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value: string;
  muted: boolean;
  /** Amber for a figure that is bad news when it is not zero. */
  tone?: "warn";
}) {
  return (
    <div className="w-14">
      <p
        className={cn(
          "tabular text-[14px] font-extrabold",
          muted ? "text-ink-faint" : tone === "warn" ? "text-amber-600" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] font-bold tracking-wide text-ink-faint uppercase">
        {label}
      </p>
    </div>
  );
}

/**
 * Where the duplicates are coming from.
 *
 * The stat tiles above say how many duplicates the survey has; they cannot say
 * whose they are, and "22 duplicates" is only actionable once it reads "18 of
 * them from one person". Duplicates spread thinly across everyone is a form
 * that is easy to submit twice — a survey problem. Duplicates concentrated on
 * one ambassador is that ambassador — a person problem. The same number means
 * opposite things, so it is broken out rather than totalled.
 *
 * Ranked by count, and the share is of everything that ambassador brought in
 * rather than of all duplicates: two duplicates out of three responses is a
 * worse signal than six out of ninety, and ranking alone would put them the
 * wrong way round.
 */
function Duplicates({ rows }: { rows: SurveyAmbassador[] }) {
  const offenders = rows
    .filter((row) => row.duplicates > 0)
    .sort((a, b) => b.duplicates - a.duplicates || a.name.localeCompare(b.name));

  const total = offenders.reduce((sum, row) => sum + row.duplicates, 0);
  const worst = offenders[0]?.duplicates ?? 1;

  return (
    <Card>
      <CardBody>
        <h2 className="display text-[16px] text-ink">Duplicates by ambassador</h2>

        {offenders.length === 0 ? (
          <p className="mt-1 text-[12.5px] font-semibold text-emerald-600">
            Nothing marked as a duplicate on this survey.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
              {formatNumber(total)} duplicate{total === 1 ? "" : "s"} from{" "}
              {offenders.length} of {rows.length} ambassador
              {rows.length === 1 ? "" : "s"}. The share is of everything that
              person brought in.
            </p>

            <ul className="mt-3 divide-y divide-gray-100">
              {offenders.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50 text-[11.5px] font-extrabold text-amber-700"
                  >
                    {initials(row.name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/ambassadors/${row.id}`}
                      className="block truncate text-[13.5px] font-bold text-ink hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="truncate text-[12px] text-ink-soft">
                      {formatNumber(row.responses)} counted ·{" "}
                      {formatNumber(row.duplicates)} duplicate
                      {row.duplicates === 1 ? "" : "s"}
                      {row.flagged > 0
                        ? ` · ${formatNumber(row.flagged)} flagged`
                        : ""}
                    </p>
                  </div>

                  {/* Width against the worst offender, so the shape of the
                      problem is readable without doing the division. */}
                  <div className="hidden h-2.5 w-28 shrink-0 overflow-hidden rounded-full bg-gray-100 sm:block">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{
                        width: `${Math.max(6, (row.duplicates / worst) * 100)}%`,
                      }}
                    />
                  </div>

                  <div className="w-16 shrink-0 text-right">
                    <p className="tabular text-[14px] font-extrabold text-amber-600">
                      {formatNumber(row.duplicates)}
                    </p>
                    <p className="tabular text-[10.5px] font-bold text-ink-faint">
                      {row.duplicateRate === null
                        ? "—"
                        : `${Math.round(row.duplicateRate * 100)}% of theirs`}
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    <Copy className="size-3" />
                    Duplicates
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}
