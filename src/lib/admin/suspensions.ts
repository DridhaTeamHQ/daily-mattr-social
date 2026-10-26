import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { nextReferralCode } from "@/lib/referral-code";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Suspended and deleted ambassadors: whose codes can be handed on, and who is
 * past the 30 days and gets deleted. The suspension archive is written by a
 * trigger (0057); codes from deleted people are recorded here (0058).
 */

type Db = SupabaseClient<Database>;

export type ReusableCode = {
  code: string;
  fromName: string;
  batch: string | null;
  /** When the slot was given up — suspended, or deleted. */
  since: string;
  source: "suspended" | "deleted";
};

/**
 * Codes nobody has been given yet: from suspended ambassadors, and from
 * deleted ones.
 *
 * Offered when adding somebody, so a code already on posters and in bios
 * keeps working for whoever fills the slot. Deleted first, since that slot
 * is certainly free, then oldest suspension first — the least likely to come
 * back.
 */
export async function reusableReferralCodes(
  db: Db = createAdminClient(),
): Promise<ReusableCode[]> {
  const [{ data: suspended, error }, { data: released }] = await Promise.all([
    db
      .from("suspended_ambassadors")
      .select("ambassador_id, referral_code, full_name, batch, suspended_at")
      .is("code_reassigned_at", null)
      .order("suspended_at", { ascending: true }),
    // Not fatal when it fails: until 0058 is applied there are only suspended
    // codes to offer, and that is still worth showing.
    db
      .from("released_referral_codes")
      .select("code, from_name, batch, released_at")
      .is("reassigned_to", null)
      .order("released_at", { ascending: true }),
  ]);
  if (error) throw error;

  const candidates: (ReusableCode & { ownerId: string | null })[] = [
    ...(released ?? []).map((r) => ({
      code: r.code,
      fromName: r.from_name,
      batch: r.batch,
      since: r.released_at,
      source: "deleted" as const,
      ownerId: null,
    })),
    ...(suspended ?? []).map((r) => ({
      code: r.referral_code,
      fromName: r.full_name,
      batch: r.batch,
      since: r.suspended_at,
      source: "suspended" as const,
      ownerId: r.ambassador_id,
    })),
  ];
  if (candidates.length === 0) return [];

  // A suspended person's code still on their own profile is free to take;
  // any code that has turned up on somebody else's (typed by hand, or
  // generated again after a delete) is not.
  const { data: holders } = await db
    .from("profiles")
    .select("id, referral_code")
    .in(
      "referral_code",
      candidates.map((c) => c.code),
    );
  const heldBy = new Map((holders ?? []).map((h) => [h.referral_code, h.id]));

  const seen = new Set<string>();
  return candidates
    .filter((c) => {
      const holder = heldBy.get(c.code);
      if (holder && holder !== c.ownerId) return false;
      if (seen.has(c.code)) return false;
      seen.add(c.code);
      return true;
    })
    .map((c) => ({
      code: c.code,
      fromName: c.fromName,
      batch: c.batch,
      since: c.since,
      source: c.source,
    }));
}

export type ClaimedCode = {
  code: string;
  source: ReusableCode["source"];
  /** The suspended ambassador it came off, for a suspended code. */
  fromId: string | null;
};

/**
 * Whether a code can still be reused — checked before anything is created,
 * so a form that lost the race fails cleanly.
 */
export async function checkReusableCode(
  db: Db,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const available = await reusableReferralCodes(db);
  return available.some((c) => c.code === code)
    ? { ok: true }
    : {
        ok: false,
        message: `${code} isn't free to reuse any more. Pick another or let one be generated.`,
      };
}

/**
 * Frees a code for somebody new.
 *
 * A deleted person's code is already free. A suspended person's has to come
 * off them first, because the code is unique: they get a random placeholder
 * rather than the next serial — they are suspended, nobody will see it, and a
 * reinstatement issues a proper one anyway.
 */
export async function claimReusableCode(
  db: Db,
  code: string,
): Promise<{ ok: true; claim: ClaimedCode } | { ok: false; message: string }> {
  const available = await reusableReferralCodes(db);
  const match = available.find((c) => c.code === code);
  if (!match) {
    return {
      ok: false,
      message: `${code} isn't free to reuse any more. Pick another or let one be generated.`,
    };
  }

  if (match.source === "deleted") {
    return { ok: true, claim: { code, source: "deleted", fromId: null } };
  }

  const { data: archived } = await db
    .from("suspended_ambassadors")
    .select("ambassador_id")
    .eq("referral_code", code)
    .is("code_reassigned_at", null)
    .maybeSingle();
  if (!archived) {
    return { ok: false, message: `${code} isn't free to reuse any more.` };
  }

  const { data: placeholder, error: codeError } = await db.rpc("gen_referral_code");
  if (codeError) throw codeError;

  const { error } = await db
    .from("profiles")
    .update({ referral_code: placeholder })
    .eq("id", archived.ambassador_id)
    .eq("referral_code", code);
  if (error) throw error;

  return {
    ok: true,
    claim: { code, source: "suspended", fromId: archived.ambassador_id },
  };
}

/** Marks a claimed code as taken, so it stops being offered. */
export async function markCodeReassigned(
  db: Db,
  claim: ClaimedCode,
  newId: string,
): Promise<void> {
  const now = new Date().toISOString();
  if (claim.source === "suspended" && claim.fromId) {
    await db
      .from("suspended_ambassadors")
      .update({ code_reassigned_to: newId, code_reassigned_at: now })
      .eq("ambassador_id", claim.fromId);
  } else {
    await db
      .from("released_referral_codes")
      .update({ reassigned_to: newId, reassigned_at: now })
      .eq("code", claim.code);
  }
}

/**
 * Remembers a deleted ambassador's code so it can be offered again (0058).
 *
 * Only when the code they held was really theirs. A suspended person whose
 * code already went to somebody new is holding a random placeholder, and
 * offering that would hand out a code nobody has ever seen.
 *
 * Best effort: a delete that worked is not undone because this didn't.
 */
export async function recordReleasedCode(
  db: Db,
  input: {
    code: string;
    fromName: string;
    batch: string | null;
    reason: "deleted" | "purged";
  },
): Promise<void> {
  const { error } = await db.from("released_referral_codes").upsert({
    code: input.code,
    from_name: input.fromName,
    batch: input.batch,
    reason: input.reason,
    released_at: new Date().toISOString(),
    reassigned_to: null,
    reassigned_at: null,
  });
  if (error) console.error("released code not recorded", input.code, error);
}

/**
 * The code a profile can give back when it is deleted, or null when theirs
 * was already handed on while they were suspended.
 */
export async function ownCodeOf(
  db: Db,
  profileId: string,
  currentCode: string,
): Promise<string | null> {
  const { data: archived } = await db
    .from("suspended_ambassadors")
    .select("referral_code, code_reassigned_at")
    .eq("ambassador_id", profileId)
    .maybeSingle();
  if (!archived) return currentCode;
  if (archived.code_reassigned_at) return null;
  return archived.referral_code === currentCode ? currentCode : null;
}

/**
 * Gives somebody coming back from a suspension a brand-new code.
 *
 * Always new, even when nobody took the old one: a code that was handed out
 * while they were away could be printed somewhere already, and one rule is
 * easier to explain than two. Retries past a serial another admin grabbed in
 * the same moment, the same way nextReferralCode expects its callers to.
 */
export async function issueCodeOnReinstate(
  db: Db,
  profileId: string,
  batch: string | null,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextReferralCode(db, batch, attempt);
    const { error } = await db
      .from("profiles")
      .update({ referral_code: code })
      .eq("id", profileId);
    if (!error) return code;
    if (error.code !== "23505") throw error;
  }
  throw new Error("Couldn't issue a new referral code. Try again.");
}

// ─── Replaced ───────────────────────────────────────────────────────────────
//
// A suspended ambassador is "replaced" once their code has been handed to
// somebody new. `code_reassigned_at` is the marker rather than
// `code_reassigned_to`: the latter goes back to null if the new person is
// ever deleted, and the old one must not quietly turn back into a plain
// suspension that the purge then deletes.
//
// Replaced people leave the programme's numbers and the main list, are never
// purged, and can't sign in. Their points, downloads and submissions stay on
// their own account, so reinstating them carries on from there, on a new code.

/** Everyone whose code has gone to somebody new. */
export async function replacedAmbassadorIds(db: Db): Promise<Set<string>> {
  const { data, error } = await db
    .from("suspended_ambassadors")
    .select("ambassador_id")
    .not("code_reassigned_at", "is", null);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.ambassador_id));
}

/**
 * Whether this person has been replaced. Service role, because the archive
 * is admin-only under RLS and this is asked on the ambassador's own sign-in.
 */
export async function isReplacedAmbassador(profileId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("suspended_ambassadors")
    .select("code_reassigned_at")
    .eq("ambassador_id", profileId)
    .maybeSingle();
  return Boolean(data?.code_reassigned_at);
}

export type ReplacedAmbassador = {
  id: string;
  fullName: string;
  email: string;
  batch: string | null;
  city: string | null;
  /** The code they gave up, now the new person's. */
  code: string;
  points: number;
  downloads: number;
  reason: string | null;
  suspendedAt: string;
  replacedAt: string;
  replacement: { id: string; fullName: string; email: string } | null;
};

/** Everyone replaced, most recent first, with who took their code. */
export async function getReplacedAmbassadors(db: Db): Promise<ReplacedAmbassador[]> {
  const { data, error } = await db
    .from("suspended_ambassadors")
    .select(
      "ambassador_id, full_name, email, batch, city, referral_code, points, downloads, reason, suspended_at, code_reassigned_to, code_reassigned_at",
    )
    .not("code_reassigned_at", "is", null)
    .order("code_reassigned_at", { ascending: false });
  if (error) throw error;

  const newIds = [
    ...new Set(
      (data ?? []).flatMap((r) => (r.code_reassigned_to ? [r.code_reassigned_to] : [])),
    ),
  ];
  const { data: people } = newIds.length
    ? await db.from("profiles").select("id, full_name, email").in("id", newIds)
    : { data: [] as { id: string; full_name: string; email: string }[] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  return (data ?? []).map((r) => {
    const next = r.code_reassigned_to ? byId.get(r.code_reassigned_to) : undefined;
    return {
      id: r.ambassador_id,
      fullName: r.full_name,
      email: r.email,
      batch: r.batch,
      city: r.city,
      code: r.referral_code,
      points: r.points,
      downloads: r.downloads,
      reason: r.reason,
      suspendedAt: r.suspended_at,
      replacedAt: r.code_reassigned_at ?? r.suspended_at,
      replacement: next
        ? { id: next.id, fullName: next.full_name, email: next.email }
        : null,
    };
  });
}

/**
 * Permanently deletes everyone whose 30 days are up, unless their code went
 * to somebody new — see "Replaced" above.
 *
 * Deleting the login is enough: the profile cascades from auth.users, and
 * every table that hangs off a profile — points, downloads, submissions, this
 * archive — cascades from that. The audit row keeps a name and a code so the
 * deletion can be explained later, and a code nobody took is kept so it can
 * be offered to the next person added.
 */
export async function purgeExpiredSuspensions(): Promise<{
  deleted: number;
  failed: number;
}> {
  const db = createAdminClient();

  const { data: due, error } = await db
    .from("suspended_ambassadors")
    .select(
      "ambassador_id, full_name, referral_code, batch, suspended_at, purge_after, code_reassigned_to",
    )
    // Replaced people are kept until somebody reinstates them.
    .is("code_reassigned_at", null)
    .lte("purge_after", new Date().toISOString());
  if (error) throw error;

  let deleted = 0;
  let failed = 0;

  for (const row of due ?? []) {
    // The trigger clears the archive on reinstatement, but a row is about to
    // be destroyed for good, so the status is checked once more first.
    const { data: profile } = await db
      .from("profiles")
      .select("status")
      .eq("id", row.ambassador_id)
      .maybeSingle();
    if (profile && profile.status !== "suspended") continue;

    const { error: deleteError } = await db.auth.admin.deleteUser(
      row.ambassador_id,
    );
    if (deleteError) {
      console.error("purge.suspended", row.ambassador_id, deleteError);
      failed++;
      continue;
    }

    if (!row.code_reassigned_to) {
      await recordReleasedCode(db, {
        code: row.referral_code,
        fromName: row.full_name,
        batch: row.batch,
        reason: "purged",
      });
    }

    await db.from("audit_log").insert({
      actor_id: null,
      action: "ambassador.purge",
      entity_type: "profile",
      entity_id: row.ambassador_id,
      meta: {
        full_name: row.full_name,
        referral_code: row.referral_code,
        suspended_at: row.suspended_at,
      } as never,
    });
    deleted++;
  }

  return { deleted, failed };
}
