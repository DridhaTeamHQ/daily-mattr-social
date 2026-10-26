import Link from "next/link";
import { ArrowRight, UserX } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { AmbassadorNav } from "@/components/ambassador-nav";
import { SearchBox } from "@/components/search-box";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { setAmbassadorStatus } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/queries";
import { getReplacedAmbassadors } from "@/lib/admin/suspensions";
import { matches } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Ambassadors · Replaced" };

/**
 * Suspended ambassadors whose referral code went to somebody new.
 *
 * They are off the dashboard and out of its counts — the slot is the new
 * person's now — and they can't sign in. Everything they earned is still on
 * their own account, so Reinstate brings them back where they left off, on a
 * new code. They are never purged while they are here.
 */
export default async function ReplacedAmbassadorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();

  const [{ q }, rows] = await Promise.all([
    searchParams,
    // Session client: the archive is admin-only under RLS (0057).
    createClient().then((supabase) => getReplacedAmbassadors(supabase)),
  ]);

  const query = q ?? "";
  const list = rows.filter((r) =>
    matches(
      query,
      r.fullName,
      r.email,
      r.code,
      r.city,
      r.batch,
      r.replacement?.fullName,
      r.replacement?.email,
    ),
  );

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Replaced
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            {rows.length === 0
              ? "Suspended ambassadors whose code went to somebody new."
              : `${rows.length} suspended ${rows.length === 1 ? "ambassador" : "ambassadors"} replaced on their code. Their history is kept until you reinstate them.`}
          </p>
        </div>
        <AmbassadorNav />
      </div>

      {rows.length > 0 && (
        <SearchBox
          placeholder="Search by name, email, code or who replaced them…"
          className="w-full max-w-md"
        />
      )}

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={UserX}
            title={query ? "Nobody matches that" : "Nobody replaced yet"}
            description={
              query
                ? "Try a different name or code."
                : "Use Replace on a suspended ambassador's row to put somebody new on their referral code."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] table-fixed text-left">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[22%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="border-b border-line bg-canvas-sunk">
                <tr className="text-[11px] tracking-wide text-ink-faint uppercase">
                  <th className="px-3 py-2.5 font-medium">Suspended ambassador</th>
                  <th className="px-3 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 font-medium">Kept</th>
                  <th className="px-3 py-2.5 font-medium">Replaced by</th>
                  <th className="px-3 py-2.5 font-medium">Suspended</th>
                  <th className="px-3 py-2.5 font-medium">Replaced</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-line last:border-0 hover:bg-canvas-sunk/50"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-100 text-[11px] font-extrabold text-rose-700"
                        >
                          {initials(row.fullName || row.email)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/ambassadors/${row.id}`}
                            title={row.fullName || row.email}
                            className="block truncate text-[13.5px] font-extrabold text-ink hover:text-brand hover:underline"
                          >
                            {row.fullName || "—"}
                          </Link>
                          <p className="truncate text-[12px] text-ink-soft">
                            {row.email}
                          </p>
                          {/* Labelled: on its own, the reason typed at
                              suspension reads like a note about the row. */}
                          {row.reason && (
                            <p
                              title={`Suspension reason: ${row.reason}`}
                              className="truncate text-[11.5px] text-ink-faint"
                            >
                              <span className="font-semibold">Reason:</span>{" "}
                              {row.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-2">
                      <code className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-ink-soft">
                        {row.code}
                      </code>
                    </td>

                    {/* What they had when suspended — still on their account. */}
                    <td className="px-3 py-2 text-[12px] text-ink-soft">
                      <p className="tabular">
                        {formatNumber(row.points)} pts
                      </p>
                      <p className="tabular text-ink-faint">
                        {formatNumber(row.downloads)} downloads
                      </p>
                    </td>

                    <td className="px-3 py-2">
                      {row.replacement ? (
                        <div className="flex min-w-0 items-center gap-1.5">
                          <ArrowRight
                            aria-hidden
                            className="size-3.5 shrink-0 text-ink-faint"
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/admin/ambassadors/${row.replacement.id}`}
                              className="block truncate text-[13px] font-bold text-ink hover:text-brand hover:underline"
                            >
                              {row.replacement.fullName || row.replacement.email}
                            </Link>
                            <p className="truncate text-[11.5px] text-ink-soft">
                              {row.replacement.email}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[12px] text-ink-faint">
                          No longer on the programme
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-[12.5px] text-ink-soft">
                      {formatDate(row.suspendedAt)}
                    </td>

                    <td className="px-3 py-2 text-[12.5px] text-ink-soft">
                      {formatDate(row.replacedAt)}
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        {/* Back with everything they had, on a new code —
                            the old one belongs to whoever replaced them. */}
                        <ActionButton
                          variant="ghost"
                          size="sm"
                          className="text-emerald-700 hover:bg-emerald-50"
                          action={setAmbassadorStatus.bind(null, row.id, "active")}
                        >
                          Reinstate
                        </ActionButton>
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
