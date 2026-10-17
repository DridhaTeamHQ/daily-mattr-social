"use server";

import { revalidatePath } from "next/cache";
import { invalidateAdminCache } from "@/lib/cache/admin-generation";

import { assertAdmin, fail, type ActionResult } from "@/lib/admin/guards";
import { readAmbassadorCsv, tempPassword } from "@/lib/admin/csv";
import { xlsxToCsv } from "@/lib/admin/xlsx";
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
 * Nobody is emailed. Accounts land as 'invited', and the welcome email is
 * sent later from the ambassadors page with Send mail (welcome-actions.ts),
 * once the admin has checked the batch and is ready for it to start.
 *
 * Each row is created independently and failures are collected rather than
 * thrown. One bad address in a file of two hundred must not roll back the
 * other 199 — and the admin needs to know precisely which ones did not land.
 */

export type ImportResult = ActionResult & {
  created: {
    email: string;
    fullName: string;
    password: string;
  }[];
  failed: { line: number; email: string; reason: string }[];
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
): Promise<ImportResult> {
  const empty = { created: [], failed: [] };

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

      created.push({
        email: row.email,
        fullName: row.full_name,
        password,
      });
    }

    await invalidateAdminCache();
    revalidatePath("/admin/ambassadors");

    const parts = [
      `Added ${created.length} ambassador${created.length === 1 ? "" : "s"} as invited`,
    ];
    if (failed.length) parts.push(`skipped ${failed.length}`);

    return {
      ok: created.length > 0,
      message: `${parts.join(" · ")}. No emails sent yet.`,
      created,
      failed,
    };
  } catch (err) {
    return { ...empty, ...fail(err) };
  }
}
