"use server";

import { revalidatePath } from "next/cache";

import { assertAdminWrite, fail, type ActionResult } from "@/lib/admin/guards";
import { tempPassword } from "@/lib/admin/csv";
import {
  sendAmbassadorWelcomeEmail,
  welcomeEmailConfigured,
} from "@/lib/ambassador-email";
import { invalidateAdminCache } from "@/lib/cache/admin-generation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * How many people one call will mail.
 *
 * A server action has a time limit, and each email is a password update plus
 * a Brevo request. The bulk button sends a long selection through this in
 * chunks, so 220 people is eleven calls with progress between them rather
 * than one call that times out halfway with nobody knowing who was reached.
 */
const MAX_PER_CALL = 20;

/** Brevo is fine with a few at once; two hundred at once is asking for a 429. */
const CONCURRENCY = 4;

export type WelcomeMailResult = ActionResult & {
  sent: number;
  failed: number;
  /** Not invited (already signed in, or suspended) — left alone on purpose. */
  skipped: number;
};

/**
 * Send the welcome email — login and a fresh temporary password — to each of
 * these ambassadors.
 *
 * Invited ambassadors only. Someone who has already signed in has chosen
 * their own password, and this would replace it; a suspended one should not
 * be invited back by a stray tick. Both are counted as skipped.
 *
 * The password is set here, at send time, and goes straight into the email.
 * Nothing stores it, so there is no list of passwords to leak, and the one
 * in the email is always the one that works — sending twice just means the
 * second email's password is the live one.
 */
export async function sendWelcomeEmails(
  profileIds: string[],
): Promise<WelcomeMailResult> {
  const none = { sent: 0, failed: 0, skipped: 0 };

  try {
    const actorId = await assertAdminWrite();

    const requested = [...new Set(profileIds)];
    if (requested.length === 0) {
      return { ...none, ok: false, message: "Nobody selected." };
    }
    if (requested.length > MAX_PER_CALL) {
      return {
        ...none,
        ok: false,
        message: `Send at most ${MAX_PER_CALL} at a time.`,
      };
    }
    if (!welcomeEmailConfigured()) {
      return {
        ...none,
        ok: false,
        message: "Email isn't set up on this server (Brevo key, sender or app link missing).",
      };
    }

    const db = createAdminClient();
    const { data: profiles, error } = await db
      .from("profiles")
      .select("id, email, full_name, status")
      .in("id", requested)
      .eq("role", "ambassador");
    if (error) throw error;

    const targets = (profiles ?? []).filter((p) => p.status === "invited");
    const skipped = requested.length - targets.length;

    const { data: previous } = await db
      .from("ambassador_welcome_emails")
      .select("ambassador_id, sent_count, sent_at")
      .in(
        "ambassador_id",
        targets.map((t) => t.id),
      );
    const before = new Map((previous ?? []).map((row) => [row.ambassador_id, row]));

    let sent = 0;
    let failed = 0;

    async function mail(profile: (typeof targets)[number]) {
      const password = tempPassword();
      let ok = false;

      const { error: passwordError } = await db.auth.admin.updateUserById(profile.id, {
        password,
        email_confirm: true,
      });

      if (!passwordError) {
        await db
          .from("profiles")
          .update({ must_change_password: true })
          .eq("id", profile.id);

        const delivery = await sendAmbassadorWelcomeEmail({
          email: profile.email,
          fullName: profile.full_name || profile.email,
          password,
        }).catch(() => ({ ok: false as const }));
        ok = delivery.ok;
      }

      const prior = before.get(profile.id);
      const now = new Date().toISOString();
      await db.from("ambassador_welcome_emails").upsert({
        ambassador_id: profile.id,
        last_attempt_at: now,
        last_status: ok ? "sent" : "failed",
        sent_at: ok ? now : (prior?.sent_at ?? null),
        sent_count: (prior?.sent_count ?? 0) + (ok ? 1 : 0),
        sent_by: actorId,
      });

      if (ok) sent++;
      else failed++;
    }

    // A small pool rather than all at once or one by one.
    const queue = [...targets];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) await mail(queue.shift()!);
      }),
    );

    await db.from("audit_log").insert({
      actor_id: actorId,
      action: "ambassador.welcome_email",
      entity_type: "profile",
      entity_id: null,
      meta: { requested: requested.length, sent, failed, skipped } as never,
    });

    await invalidateAdminCache();
    revalidatePath("/admin/ambassadors");

    const parts = [`Emailed ${sent}`];
    if (failed) parts.push(`${failed} failed`);
    if (skipped) parts.push(`${skipped} not invited, skipped`);
    return {
      ok: sent > 0,
      message: parts.join(" · "),
      sent,
      failed,
      skipped,
    };
  } catch (err) {
    return { ...none, ...fail(err) };
  }
}
