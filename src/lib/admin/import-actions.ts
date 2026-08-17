"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin, fail, type ActionResult } from "@/lib/admin/guards";
import { readAmbassadorCsv, tempPassword } from "@/lib/admin/csv";
import { xlsxToCsv } from "@/lib/admin/xlsx";
import { sendAmbassadorWelcomeEmail } from "@/lib/ambassador-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextReferralCode } from "@/lib/referral-code";
import { canonicalBatch, canonicalCity } from "@/lib/batches";

/**
 * Bulk ambassador import.
 *
 * The browser parses the file first so the admin can see what will happen, but
 * this action re-parses the same text from scratch. The preview is a
 * convenience; it is not an input to be trusted, and accepting a client-sent
 * list of rows would let anyone with a session create accounts with whatever
 * fields they liked.
 *
 * Each row is created independently and failures are collected rather than
 * thrown. One bad address in a file of two hundred must not roll back the
 * other 199 — and the admin needs to know precisely which ones did not land.
 */

/** Whether the student was told their login, and if not, why not. */
export type EmailStatus = "sent" | "skipped" | "failed";

export type ImportResult = ActionResult & {
  created: {
    email: string;
    fullName: string;
    password: string;
    emailed: EmailStatus;
  }[];
  failed: { line: number; email: string; reason: string }[];
  emailSummary: { sent: number; failed: number; skipped: number };
};

/**
 * Turns an uploaded spreadsheet into the CSV text the importer takes.
 *
 * Separate from `importAmbassadors` so the admin still gets the dry run: the
 * browser sends the file here, gets CSV back, previews it with the same parser
 * it uses for an uploaded .csv, and only then imports. Nothing is created by
 * this call.
 */
export async function convertSpreadsheet(
  base64: string,
): Promise<{ ok: boolean; csv: string; message: string }> {
  try {
    await assertAdmin();

    const buffer = Buffer.from(base64, "base64");
    if (buffer.byteLength === 0) {
      return { ok: false, csv: "", message: "That file was empty." };
    }
    if (buffer.byteLength > 8 * 1024 * 1024) {
      return {
        ok: false,
        csv: "",
        message: "That file is over 8MB. Save just the ambassador sheet as .csv.",
      };
    }

    const result = await xlsxToCsv(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
    );

    if (!result.ok) return { ok: false, csv: "", message: result.message };

    return {
      ok: true,
      csv: result.csv,
      message: `Read ${result.rows} row${result.rows === 1 ? "" : "s"} from "${result.sheet}".`,
    };
  } catch (err) {
    return { csv: "", ...fail(err) };
  }
}

export async function importAmbassadors(
  csvText: string,
  /**
   * Off is a real choice. Importing a list of people who already have their
   * logins — a migration, or a re-import after a failure — should not send two
   * hundred students an email telling them their password changed when it did
   * not.
   */
  sendEmails = true,
): Promise<ImportResult> {
  const empty = {
    created: [],
    failed: [],
    emailSummary: { sent: 0, failed: 0, skipped: 0 },
  };

  try {
    await assertAdmin();

    const { rows, missingColumns } = readAmbassadorCsv(csvText);

    if (missingColumns.length > 0) {
      return {
        ...empty,
        ok: false,
        message: `The file needs a ${missingColumns.join(" and ")} column.`,
      };
    }

    const valid = rows.filter((row) => !row.error);
    if (valid.length === 0) {
      return { ...empty, ok: false, message: "No usable rows in that file." };
    }
    if (valid.length > 500) {
      return {
        ...empty,
        ok: false,
        message: "That's over 500 rows. Split the file and import it in parts.",
      };
    }

    const db = createAdminClient();
    const created: ImportResult["created"] = [];
    const failed: ImportResult["failed"] = [];

    for (const row of rows) {
      if (row.error) {
        failed.push({ line: row.line, email: row.email, reason: row.error });
        continue;
      }

      const password = tempPassword();

      const { data, error } = await db.auth.admin.createUser({
        email: row.email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: row.full_name,
          college: row.college || null,
          role: "ambassador",
        },
      });

      if (error || !data?.user) {
        failed.push({
          line: row.line,
          email: row.email,
          reason: /already|registered|exists/i.test(error?.message ?? "")
            ? "Already has an account"
            : (error?.message ?? "Could not create"),
        });
        continue;
      }

      // The trigger marks anyone created with a password as active. Walk that
      // back — they have not chosen their own password yet — and write the
      // fields the trigger knows nothing about.
      const { error: profileError } = await db
        .from("profiles")
        .update({
          status: "invited",
          must_change_password: true,
          full_name: row.full_name,
          phone: row.phone || null,
          college: row.college || null,
          city: canonicalCity(row.city),
          batch: canonicalBatch(row.batch),
          joined_as: row.joined_as,
          // Recomputed per row rather than once for the file: the rows are
          // created one at a time, so each read already sees the previous
          // row's code and the serials stay contiguous.
          referral_code: await nextReferralCode(db, canonicalBatch(row.batch)),
        })
        .eq("id", data.user.id);

      if (profileError) {
        // Otherwise the address is held by an account nobody can finish
        // setting up, and re-importing just fails with "already registered".
        await db.auth.admin.deleteUser(data.user.id).catch(() => {});
        failed.push({
          line: row.line,
          email: row.email,
          reason: profileError.message,
        });
        continue;
      }

      /**
       * The email goes out here, per row, and never decides whether the import
       * succeeded.
       *
       * The account already exists at this point. If Brevo rejects the message
       * — a rate limit at row 300, a bounced domain, a key that expired — the
       * right outcome is an ambassador who exists and an admin who is told to
       * pass the password on by hand, not a half-imported file. So the failure
       * is recorded against the row and the loop continues.
       */
      let emailed: EmailStatus = "skipped";

      if (sendEmails) {
        const delivery = await sendAmbassadorWelcomeEmail({
          email: row.email,
          fullName: row.full_name,
          password,
        }).catch(() => ({ ok: false as const, reason: "failed" as const }));

        emailed = delivery.ok
          ? "sent"
          : delivery.reason === "disabled"
            ? "skipped"
            : "failed";
      }

      created.push({
        email: row.email,
        fullName: row.full_name,
        password,
        emailed,
      });
    }

    revalidatePath("/admin/ambassadors");

    const emailSummary = {
      sent: created.filter((c) => c.emailed === "sent").length,
      failed: created.filter((c) => c.emailed === "failed").length,
      skipped: created.filter((c) => c.emailed === "skipped").length,
    };

    // The headline says what happened to the people AND to their emails,
    // because "added 40" reads as done when 40 of them were never told.
    const parts = [
      `Added ${created.length} ambassador${created.length === 1 ? "" : "s"}`,
    ];
    if (failed.length) parts.push(`skipped ${failed.length}`);
    if (emailSummary.sent) parts.push(`emailed ${emailSummary.sent}`);
    if (emailSummary.failed) {
      parts.push(`${emailSummary.failed} email${emailSummary.failed === 1 ? "" : "s"} failed`);
    }

    return {
      ok: created.length > 0,
      message: `${parts.join(" · ")}.`,
      created,
      failed,
      emailSummary,
    };
  } catch (err) {
    return { ...empty, ...fail(err) };
  }
}
