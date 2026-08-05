import Link from "next/link";
import { Banknote, Check, Download, Wallet, X } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { ReasonDialog } from "@/components/reason-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import {
  buildRedemptionBatch,
  decideRedemption,
  markPayoutFailed,
  markPayoutPaid,
  setBatchStatus,
} from "@/lib/admin/money-actions";
import {
  getMoneySummary,
  getPayoutBatches,
  getRedemptions,
} from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/queries";
import { formatDate, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Payouts" };

const BATCH_TONE = {
  pending: "neutral",
  processing: "warn",
  paid: "ok",
  failed: "bad",
} as const;

function rupees(value: number | string): string {
  return `₹${formatNumber(Number(value))}`;
}

/**
 * Payout Management.
 *
 * Two queues that end in the same place. A redemption is a student asking to
 * turn points into cash and needs a decision; a stipend is earned by hitting a
 * threshold and needs no decision at all. Both then become payout rows that
 * somebody has to actually send money for, and that last step is the one this
 * page exists to make honest: a payout is only "paid" once it carries the
 * bank's reference.
 */
export default async function PayoutsPage() {
  await requireAdmin();

  const [summary, redemptions, batches] = await Promise.all([
    getMoneySummary(),
    getRedemptions(),
    getPayoutBatches(),
  ]);

  const open = redemptions.filter((r) => r.status === "requested");
  const approvedWaiting = redemptions.filter((r) => r.status === "approved");

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[24px] leading-none text-ink">Payouts</h1>
          <p className="mt-2 text-[13px] font-semibold text-ink-soft">
            Redemption requests, stipend batches, and what has actually been
            sent.
          </p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/admin/stipend">Stipend tracker</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Stipend paid"
          value={rupees(summary.stipendPaidInr)}
          sub="To date"
          icon={Banknote}
          tone="brand"
        />
        <Stat
          label="Redemptions paid"
          value={rupees(summary.redemptionPaidInr)}
          sub="Points turned to cash"
          icon={Wallet}
          tone="rank"
        />
        <Stat
          label="Queued"
          value={rupees(summary.pendingInr)}
          sub="Batched, not yet sent"
          icon={Wallet}
          tone="invite"
        />
        <Stat
          label="Cost per download"
          value={
            summary.costPerDownloadInr === null
              ? "—"
              : `₹${summary.costPerDownloadInr.toFixed(2)}`
          }
          sub={`${formatNumber(summary.downloads)} downloads`}
          icon={Banknote}
          tone="poll"
        />
      </div>

      {/* ─── Requests awaiting a decision ──────────────────────────────────── */}
      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Redemption requests</h2>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
            Approving burns the points immediately. The balance is re-checked at
            that moment, not when they asked.
          </p>

          {open.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nothing waiting"
              description="Requests appear here as ambassadors send them."
            />
          ) : (
            <ul className="mt-4 divide-y-[3px] divide-ink">
              {open.map((r) => {
                const short = r.balance < r.points;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span
                      aria-hidden
                      className="brut-sm grid size-9 shrink-0 place-items-center rounded-full bg-canvas-sunk text-[11.5px] font-extrabold text-ink"
                    >
                      {initials(r.ambassador?.full_name ?? "?")}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-extrabold text-ink">
                        {r.ambassador?.full_name ?? "Unknown"}
                      </p>
                      <p className="truncate text-[12px] text-ink-soft">
                        {formatNumber(r.points)} points → {rupees(r.amount_inr)}
                        {r.payee_ref ? ` · ${r.payee_ref}` : ""} ·{" "}
                        {formatDate(r.requested_at)}
                      </p>
                    </div>

                    {/* Surfaced before the decision, not after it fails: the
                        approve action refuses anyway, but finding that out by
                        clicking is a worse experience than being told. */}
                    {short && (
                      <Badge tone="bad" dot>
                        only {formatNumber(r.balance)} left
                      </Badge>
                    )}

                    <div className="flex gap-2">
                      <ActionButton
                        size="sm"
                        action={decideRedemption.bind(null, r.id, "approved", undefined)}
                        confirmMessage={`Approve ${rupees(r.amount_inr)} for ${r.ambassador?.full_name ?? "this ambassador"}? ${formatNumber(r.points)} points come off their balance now.`}
                      >
                        Approve
                      </ActionButton>
                      <ReasonDialog
                        title="Decline this request"
                        description="They'll see the reason, so make it something they can act on."
                        label="Reason"
                        placeholder="Balance already redeemed this month"
                        confirmLabel="Decline"
                        action={async (reason: string) =>
                          decideRedemption(r.id, "rejected", reason)
                        }
                        trigger={
                          <Button size="sm" variant="secondary">
                            Decline
                          </Button>
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {approvedWaiting.length > 0 && (
            <Note tone="ok" title={`${approvedWaiting.length} approved and waiting`} className="mt-4">
              Their points are already burned. Batch them so finance has one
              file to upload.
              <div className="mt-3">
                <ActionButton
                  size="sm"
                  action={buildRedemptionBatch}
                  confirmMessage="Collect every approved redemption into one batch?"
                >
                  Build redemption batch
                </ActionButton>
              </div>
            </Note>
          )}
        </CardBody>
      </Card>

      {/* ─── Batches ───────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="display text-[16px] text-ink">Batches</h2>

        {batches.length === 0 ? (
          <Card>
            <EmptyState
              icon={Banknote}
              title="No batches yet"
              description="Build one from the stipend tracker or from approved redemptions."
            />
          </Card>
        ) : (
          batches.map((batch) => (
            <Card key={batch.id}>
              <CardBody>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="display text-[15px] text-ink">{batch.label}</h3>
                  <Badge tone={BATCH_TONE[batch.status]} dot>
                    {batch.status}
                  </Badge>
                  <Badge tone="neutral">
                    {batch.totals.count} · {rupees(batch.totals.amountInr)}
                  </Badge>
                  {batch.totals.failed > 0 && (
                    <Badge tone="bad">{batch.totals.failed} failed</Badge>
                  )}

                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="secondary" asChild>
                      <a href={`/admin/payouts/${batch.id}/export`}>
                        <Download aria-hidden />
                        CSV
                      </a>
                    </Button>
                    {batch.status !== "paid" && (
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        action={setBatchStatus.bind(null, batch.id, "paid")}
                        confirmMessage={`Mark the whole batch "${batch.label}" as paid? This does not add references to the individual payouts.`}
                      >
                        Close batch
                      </ActionButton>
                    )}
                  </div>
                </div>

                <ul className="mt-3 divide-y-[3px] divide-ink">
                  {batch.payouts.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-extrabold text-ink">
                          {p.ambassador?.full_name ?? "Unknown"}
                        </p>
                        <p className="truncate text-[12px] text-ink-soft">
                          {rupees(p.amount_inr)}
                          {p.utr ? ` · UTR ${p.utr}` : ""}
                          {p.failure_reason ? ` · ${p.failure_reason}` : ""}
                        </p>
                      </div>

                      <Badge tone={BATCH_TONE[p.status]} dot>
                        {p.status}
                      </Badge>

                      {p.status !== "paid" && (
                        <div className="flex gap-2">
                          <ReasonDialog
                            title="Mark paid"
                            description="The bank's transaction reference is what makes this row reconcilable months from now, when someone says the money never arrived."
                            label="UTR / transaction reference"
                            placeholder="N123456789012345"
                            confirmLabel="Mark paid"
                            action={async (utr: string) => markPayoutPaid(p.id, utr)}
                            trigger={
                              <Button size="sm">
                                <Check aria-hidden />
                                Paid
                              </Button>
                            }
                          />
                          <ReasonDialog
                            title="Mark failed"
                            description="What went wrong? It stays on the row."
                            label="Reason"
                            placeholder="Bank rejected the UPI id"
                            confirmLabel="Mark failed"
                            action={async (reason: string) =>
                              markPayoutFailed(p.id, reason)
                            }
                            trigger={
                              <Button size="sm" variant="secondary" aria-label="Mark failed">
                                <X aria-hidden />
                              </Button>
                            }
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
