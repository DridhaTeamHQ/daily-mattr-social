import { Users } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import {
  AddAmbassadorDialog,
  AdjustPointsDialog,
  ResetPasswordDialog,
} from "@/components/ambassador-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { setAmbassadorStatus } from "@/lib/admin/actions";
import { getAmbassadors } from "@/lib/admin/queries";
import { formatDate, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Ambassadors" };

const STATUS_TONE = {
  active: "ok",
  invited: "warn",
  suspended: "bad",
} as const;

export default async function AmbassadorsPage() {
  const rows = await getAmbassadors();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Ambassadors
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            {rows.length} {rows.length === 1 ? "person" : "people"} on the
            programme.
          </p>
        </div>

        <AddAmbassadorDialog />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No ambassadors yet"
            description="Add your first student — you'll get a temporary password to pass on, and they pick their own on first sign-in."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Horizontal scroll rather than hiding columns: an admin comparing
              point totals needs the numbers next to the names. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left">
              <thead className="border-b border-line bg-canvas-sunk">
                <tr className="text-[11.5px] tracking-wide text-ink-faint uppercase">
                  <th className="px-4 py-2.5 font-medium">Ambassador</th>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 text-right font-medium">Points</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-canvas-sunk/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="brut-sm grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-extrabold text-ink"
                        >
                          {initials(row.full_name || row.email)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium text-ink">
                            {row.full_name || "—"}
                          </p>
                          <p className="truncate text-[12px] text-ink-soft">
                            {row.college ?? row.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <code className="font-mono text-[12.5px] text-ink-soft">
                        {row.referral_code}
                      </code>
                    </td>

                    <td className="tabular px-4 py-3 text-right text-[13.5px] font-semibold text-ink">
                      {formatNumber(row.points)}
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[row.status]} dot>
                        {row.status}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 text-[12.5px] text-ink-soft">
                      {formatDate(row.created_at)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <AdjustPointsDialog
                          profileId={row.id}
                          name={row.full_name || row.email}
                        />

                        <ResetPasswordDialog
                          profileId={row.id}
                          name={row.full_name || row.email}
                        />

                        {row.status === "suspended" ? (
                          <ActionButton
                            variant="ghost"
                            size="sm"
                            action={setAmbassadorStatus.bind(null, row.id, "active")}
                          >
                            Reinstate
                          </ActionButton>
                        ) : (
                          <ActionButton
                            variant="ghost"
                            size="sm"
                            action={setAmbassadorStatus.bind(
                              null,
                              row.id,
                              "suspended",
                            )}
                            confirmMessage={`Suspend ${row.full_name || row.email}? They keep their login and history but stop earning.`}
                          >
                            Suspend
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
