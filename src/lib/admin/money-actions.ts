"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin, fail, type ActionResult } from "@/lib/admin/guards";
import { notify } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { monthLabel } from "@/lib/admin/money";

/**
 * The money write path.
 *
 * Two rules govern everything here.
 *
 * First, points are only ever burned by an append-only ledger row, never by
 * editing a balance — the same rule the rest of the app follows. A redemption
 * that is approved writes a negative delta; if it is later rejected, that is a
 * second, positive row. The history stays legible.
 *
 * Second, nothing marks money as paid without a reference. `markPaid` requires
 * a UTR, because a payout row that says "paid" with nothing to reconcile
 * against is an assertion rather than a receipt, and the one time it matters is
 * the one time someone says they never received it.
 */

// ─── Redemptions ────────────────────────────────────────────────────────────

export async function decideRedemption(
  requestId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const db = createAdminClient();

    const { data: request } = await db
      .from("redemption_requests")
      .select("id, ambassador_id, points, amount_inr, status")
      .eq("id", requestId)
      .maybeSingle();

    if (!request) return { ok: false, message: "That request no longer exists." };
    if (request.status !== "requested") {
      return { ok: false, message: `Already ${request.status}.` };
    }

    if (decision === "approved") {
      // Re-check the balance at approval time, not at request time. Someone can
      // request 2,000 points on Monday and have an approval revoked on Tuesday;
      // paying out against a stale balance is how a ledger goes negative.
      const { data: ledger } = await db
        .from("point_ledger")
        .select("delta")
        .eq("ambassador_id", request.ambassador_id);

      const balance = (ledger ?? []).reduce((sum, row) => sum + row.delta, 0);
      if (balance < request.points) {
        return {
          ok: false,
          message: `They only have ${balance} points now — not enough for this ${request.points}-point request.`,
        };
      }

      const { error: ledgerError } = await db.from("point_ledger").insert({
        ambassador_id: request.ambassador_id,
        delta: -request.points,
        reason: "manual_adjust",
        source_type: "redemption_request",
        source_id: request.id,
        note: "Points redeemed for cash",
        created_by: actorId,
        phase: "phase_2",
      });
      if (ledgerError) throw ledgerError;
    }

    const { error } = await db
      .from("redemption_requests")
      .update({
        status: decision,
        decided_by: actorId,
        decided_at: new Date().toISOString(),
        decision_note: note?.trim() || null,
      })
      .eq("id", requestId);
    if (error) throw error;

    await notify({
      profileId: request.ambassador_id,
      type: "points_awarded",
      title:
        decision === "approved"
          ? `Redemption approved — ₹${Number(request.amount_inr).toLocaleString("en-IN")}`
          : "Redemption request declined",
      body:
        decision === "approved"
          ? "It'll go out in the next payout batch."
          : note?.trim() || "Ask an admin if you're not sure why.",
      href: "/dashboard/rewards",
    }).catch(() => {});

    revalidatePath("/admin/stipend");
    revalidatePath("/dashboard/rewards");

    return {
      ok: true,
      message: decision === "approved" ? "Approved." : "Declined.",
    };
  } catch (err) {
    return fail(err);
  }
}

// ─── Batches ────────────────────────────────────────────────────────────────

/**
 * Builds a stipend batch for a month from live eligibility.
 *
 * Safe to run more than once: anyone already in a batch for that month is
 * skipped, and the unique index backs that up rather than trusting this code.
 * Re-running after correcting a download count is a normal thing to do.
 */
export async function buildStipendBatch(month: string): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();

    const supabase = await createClient();
    const db = createAdminClient();

    const [{ data: rows, error: rpcError }, settings] = await Promise.all([
      supabase.rpc("stipend_eligibility", { period_start: month }),
      getSettings("stipend_amount_inr"),
    ]);
    if (rpcError) throw rpcError;

    const eligible = (rows ?? []).filter((r) => r.met);
    if (eligible.length === 0) {
      return { ok: false, message: "Nobody met the threshold for that month." };
    }

    const { data: existing } = await db
      .from("payouts")
      .select("ambassador_id, payout_batches!inner(period_month)")
      .eq("kind", "stipend")
      .eq("payout_batches.period_month", month);

    const alreadyPaid = new Set((existing ?? []).map((p) => p.ambassador_id));
    const toPay = eligible.filter((r) => !alreadyPaid.has(r.ambassador_id));

    if (toPay.length === 0) {
      return { ok: false, message: "Everyone eligible is already in a batch." };
    }

    const { data: batch, error: batchError } = await db
      .from("payout_batches")
      .insert({
        label: `Stipend — ${monthLabel(month)}`,
        kind: "stipend",
        period_month: month,
        created_by: actorId,
      })
      .select("id")
      .single();
    if (batchError) throw batchError;

    const { error: payoutError } = await db.from("payouts").insert(
      toPay.map((r) => ({
        batch_id: batch.id,
        ambassador_id: r.ambassador_id,
        kind: "stipend",
        amount_inr: settings.stipend_amount_inr,
      })),
    );
    if (payoutError) throw payoutError;

    revalidatePath("/admin/stipend");
    revalidatePath("/admin/stipend");

    return {
      ok: true,
      message: `Batch created for ${toPay.length} ambassador${toPay.length === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    return fail(err);
  }
}

/** Collects every approved-but-unpaid redemption into one batch. */
export async function buildRedemptionBatch(): Promise<ActionResult> {
  try {
    const actorId = await assertAdmin();
    const db = createAdminClient();

    const { data: approved } = await db
      .from("redemption_requests")
      .select("id, ambassador_id, amount_inr")
      .eq("status", "approved");

    if (!approved?.length) {
      return { ok: false, message: "No approved redemptions waiting." };
    }

    const { data: queued } = await db
      .from("payouts")
      .select("redemption_id")
      .eq("kind", "redemption")
      .not("redemption_id", "is", null);

    const done = new Set((queued ?? []).map((p) => p.redemption_id));
    const toPay = approved.filter((r) => !done.has(r.id));

    if (toPay.length === 0) {
      return { ok: false, message: "They're all in a batch already." };
    }

    const { data: batch, error: batchError } = await db
      .from("payout_batches")
      .insert({
        label: `Redemptions — ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
        kind: "redemption",
        created_by: actorId,
      })
      .select("id")
      .single();
    if (batchError) throw batchError;

    const { error } = await db.from("payouts").insert(
      toPay.map((r) => ({
        batch_id: batch.id,
        ambassador_id: r.ambassador_id,
        redemption_id: r.id,
        kind: "redemption",
        amount_inr: r.amount_inr,
      })),
    );
    if (error) throw error;

    revalidatePath("/admin/stipend");
    return { ok: true, message: `Batch created for ${toPay.length} payout${toPay.length === 1 ? "" : "s"}.` };
  } catch (err) {
    return fail(err);
  }
}

/** Marks one payout paid. The UTR is required — see the note at the top. */
export async function markPayoutPaid(
  payoutId: string,
  utr: string,
): Promise<ActionResult> {
  try {
    await assertAdmin();

    const reference = utr.trim();
    if (reference.length < 4) {
      return {
        ok: false,
        message: "Enter the bank's transaction reference (UTR) before marking it paid.",
      };
    }

    const db = createAdminClient();

    const { data: payout } = await db
      .from("payouts")
      .select("id, ambassador_id, amount_inr, redemption_id, kind")
      .eq("id", payoutId)
      .maybeSingle();
    if (!payout) return { ok: false, message: "That payout no longer exists." };

    const now = new Date().toISOString();

    const { error } = await db
      .from("payouts")
      .update({ status: "paid", utr: reference, processed_at: now })
      .eq("id", payoutId);
    if (error) throw error;

    if (payout.redemption_id) {
      await db
        .from("redemption_requests")
        .update({ status: "paid", payee_ref: reference })
        .eq("id", payout.redemption_id);
    }

    await notify({
      profileId: payout.ambassador_id,
      type: "points_awarded",
      title: `₹${Number(payout.amount_inr).toLocaleString("en-IN")} paid`,
      body: `Reference ${reference}.`,
      href: "/dashboard/rewards",
    }).catch(() => {});

    revalidatePath("/admin/stipend");
    revalidatePath("/dashboard/rewards");

    return { ok: true, message: "Marked paid." };
  } catch (err) {
    return fail(err);
  }
}

export async function markPayoutFailed(
  payoutId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const db = createAdminClient();

    const { error } = await db
      .from("payouts")
      .update({
        status: "failed",
        failure_reason: reason.trim() || "No reason given",
        processed_at: new Date().toISOString(),
      })
      .eq("id", payoutId);
    if (error) throw error;

    revalidatePath("/admin/stipend");
    return { ok: true, message: "Marked failed." };
  } catch (err) {
    return fail(err);
  }
}

export async function setBatchStatus(
  batchId: string,
  status: "processing" | "paid" | "pending",
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const db = createAdminClient();

    const { error } = await db
      .from("payout_batches")
      .update({
        status,
        processed_at: status === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", batchId);
    if (error) throw error;

    revalidatePath("/admin/stipend");
    return { ok: true, message: `Batch marked ${status}.` };
  } catch (err) {
    return fail(err);
  }
}
