"use client";

import * as React from "react";
import { Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requestRedemption } from "@/lib/rewards-actions";
import { cn } from "@/lib/utils";

/**
 * The redemption request form.
 *
 * Shows the rupee value as the student types, because "1,500 points" means
 * nothing on its own and the whole question they are answering is how much
 * money they are asking for.
 */
export function RedeemForm({
  balance,
  minPoints,
  pointsPerRupee,
  reserved,
}: {
  balance: number;
  minPoints: number;
  pointsPerRupee: number;
  reserved: number;
}) {
  const available = balance - reserved;

  const [points, setPoints] = React.useState("");
  const [upi, setUpi] = React.useState("");
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const parsed = Number(points);
  const valid = Number.isInteger(parsed) && parsed >= minPoints && parsed <= available;
  const rupees = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed / pointsPerRupee) : 0;

  if (available < minPoints) {
    return (
      <p className="text-[13px] font-semibold text-ink-soft">
        You need {minPoints} free points to make a request.{" "}
        {reserved > 0
          ? `${reserved} of your ${balance} are already in a pending request.`
          : `You have ${balance}.`}
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || pending) return;
        startTransition(async () => {
          const res = await requestRedemption(parsed, upi);
          setResult(res);
          if (res.ok) {
            setPoints("");
            setUpi("");
          }
        });
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
            Points to redeem
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={minPoints}
            max={available}
            step={1}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder={String(minPoints)}
            className="mt-1.5 h-11 w-full rounded-lg border border-gray-200 bg-surface px-3 text-[15px] font-semibold text-ink focus:border-brand focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
            UPI id
          </span>
          <input
            value={upi}
            onChange={(e) => setUpi(e.target.value)}
            placeholder="you@upi"
            className="mt-1.5 h-11 w-full rounded-lg border border-gray-200 bg-surface px-3 text-[15px] font-semibold text-ink focus:border-brand focus:outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!valid || !upi.trim() || pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Wallet aria-hidden />}
          Request {rupees > 0 ? `₹${rupees.toLocaleString("en-IN")}` : "payout"}
        </Button>

        <span className="text-[12.5px] font-semibold text-ink-soft">
          {pointsPerRupee} points = ₹1 · {available.toLocaleString("en-IN")} free
        </span>
      </div>

      {result && (
        <p
          role="status"
          className={cn(
            "text-[13px] font-bold",
            result.ok ? "text-ok" : "text-bad",
          )}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
