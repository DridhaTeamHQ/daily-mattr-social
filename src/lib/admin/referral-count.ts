import "server-only";

import { revalidatePath } from "next/cache";
import { invalidateAdminCache } from "@/lib/cache/admin-generation";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { getActiveVersion } from "@/lib/programme-version";
import { getUnlockAt, isUnlocked } from "@/lib/settings";
import { awardReferralBonus } from "@/lib/rewards-engine";
import { evaluateBadges } from "@/lib/badges";
import { readAll } from "@/lib/admin/read-all";
import type { ActionResult } from "@/lib/admin/guards";

/** How many ids go in one void request. */
const VOID_BATCH = 200;

/**
 * Sets an ambassador's confirmed download count for this run, minus the
 * session check.
 *
 * Split out of `setReferralCount` so the Google Sheet sync runs the identical
 * path — the rows, the points, the bonus, the badges and the notification —
 * rather than a second copy of it. It lives outside `actions.ts` on purpose:
 * every export of a "use server" file is a public endpoint, and this one does
 * no auth of its own. Callers check first: the admin action with
 * `assertAdminWrite()`, the sheet route with its shared secret.
 *
 * `actorId` is null when nobody signed in made the change (the sheet).
 */
export async function applyReferralCount(
  profileId: string,
  count: number,
  actorId: string | null,
  via: "admin" | "sheet" = "admin",
): Promise<ActionResult> {
  if (!Number.isInteger(count) || count < 0 || count > 10_000) {
    return { ok: false, message: "Enter a whole number of downloads." };
  }

  const db = createAdminClient();

  const { data: profile } = await db
    .from("profiles")
    .select("referral_code, full_name")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return { ok: false, message: "That ambassador no longer exists." };

  // This run's installs only. The number an admin types is the number they
  // are looking at on this run's page, so the rows added or voided to reach
  // it have to be this run's too — otherwise setting a new ambassador to 5
  // would start by voiding five of last run's confirmed downloads.
  const version = await getActiveVersion();

  // Paged: a plain select stops at 1000 rows, and every count past that would
  // add or void the wrong number. `id` breaks ties so pages can't overlap.
  const counted = await readAll(
    (from, to) =>
      db
        .from("referral_conversions")
        .select("id, source, converted_at")
        .eq("ambassador_id", profileId)
        .eq("status", "counted")
        .eq("version", version)
        .order("converted_at", { ascending: false })
        .order("id")
        .range(from, to),
    "applyReferralCount",
  );
  const perReferral = await referralPoints();

  // ─── Add ────────────────────────────────────────────────────────────────
  if (count > counted.length) {
    // Locked means the standings are final. Installs referred after the
    // board shut are not this month's, so nothing new is counted until it
    // reopens. Lowering a count is still allowed — that is a correction.
    if (!isUnlocked(await getUnlockAt("stipend_unlock_at"))) {
      return {
        ok: false,
        message:
          "The board is locked, so no new installs can be counted. Reopen it to add more.",
      };
    }

    const toAdd = count - counted.length;
    const rows = Array.from({ length: toAdd }, (_, i) => ({
      ambassador_id: profileId,
      code: profile.referral_code,
      // Unique per row, and stable enough that re-running can't double up.
      external_user_ref: `manual-${profileId}-${Date.now()}-${i}`,
      source: "manual" as const,
      status: "counted" as const,
    }));

    const { data: inserted, error } = await db
      .from("referral_conversions")
      .insert(rows)
      .select("id");
    if (error) throw error;

    if (perReferral > 0 && inserted?.length) {
      // Same idempotent source pair the rest of the ledger uses.
      await db.from("point_ledger").insert(
        inserted.map((row) => ({
          ambassador_id: profileId,
          delta: perReferral,
          reason: "referral" as const,
          source_type: "referral_conversion",
          source_id: row.id,
          note: "App download confirmed",
          created_by: actorId,
        })),
      );
    }

    // Past the threshold, later downloads are worth more. Runs after the
    // flat award so it tops up rather than replacing it, and it is a no-op
    // when nothing new is owed.
    await awardReferralBonus(profileId, actorId).catch(() => {});
    await evaluateBadges(profileId).catch(() => {});

    await notify({
      profileId,
      type: "referral_confirmed",
      title: `${toAdd} referral${toAdd === 1 ? "" : "s"} confirmed`,
      body:
        perReferral > 0
          ? `That's ${toAdd * perReferral} points.`
          : "Your download count went up.",
      href: "/dashboard/referrals",
      meta: { added: toAdd },
    }).catch(() => {});
  }

  // ─── Remove ─────────────────────────────────────────────────────────────
  if (count < counted.length) {
    const toRemove = counted.length - count;

    // Newest manual rows first; imported ones are only touched if there is
    // nothing manual left to void.
    const ordered = [
      ...counted.filter((c) => c.source === "manual"),
      ...counted.filter((c) => c.source !== "manual"),
    ].slice(0, toRemove);

    const ids = ordered.map((c) => c.id);

    // In batches: the ids ride in the request URL, and a couple of thousand
    // of them is more than the API will take in one request.
    for (let i = 0; i < ids.length; i += VOID_BATCH) {
      const { error } = await db
        .from("referral_conversions")
        .update({ status: "void", notes: "Adjusted by an admin" })
        .in("id", ids.slice(i, i + VOID_BATCH));
      if (error) throw error;
    }

    if (perReferral > 0) {
      // Compensating rows, never deletions — the original credit stays in
      // their history beside its reversal.
      await db.from("point_ledger").insert(
        ids.map((id) => ({
          ambassador_id: profileId,
          delta: -perReferral,
          reason: "revoke" as const,
          source_type: "referral_conversion",
          source_id: id,
          note: "Referral count corrected",
          created_by: actorId,
        })),
      );
    }

    // The multiplier uplift is owed on downloads past the threshold, so
    // taking downloads away has to recompute it too. Reversing only the flat
    // points left the bonus behind, paid for installs that had just been
    // voided — and the bigger the correction, the more of it survived.
    await awardReferralBonus(profileId, actorId).catch(() => {});
    await evaluateBadges(profileId).catch(() => {});
  }

  await db.from("audit_log").insert({
    actor_id: actorId,
    action: "referral.set_count",
    entity_type: "profile",
    entity_id: profileId,
    meta: { count, via } as never,
  });

  await invalidateAdminCache();
  revalidatePath("/admin/referrals");
  revalidatePath("/dashboard/referrals");
  return {
    ok: true,
    message:
      count === counted.length
        ? "No change"
        : `${profile.full_name || "Ambassador"} now shows ${count} download${count === 1 ? "" : "s"}`,
  };
}

/** Points per confirmed download, from settings. */
async function referralPoints(): Promise<number> {
  const { data } = await createAdminClient()
    .from("app_settings")
    .select("value")
    .eq("key", "points.referral")
    .maybeSingle();

  const parsed = Number(data?.value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
}

