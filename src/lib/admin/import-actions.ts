"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin, fail, type ActionResult } from "@/lib/admin/guards";
import { readAmbassadorCsv, tempPassword } from "@/lib/admin/csv";
import { createAdminClient } from "@/lib/supabase/admin";

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

export type ImportResult = ActionResult & {
  created: { email: string; fullName: string; password: string }[];
  failed: { line: number; email: string; reason: string }[];
};

export async function importAmbassadors(csvText: string): Promise<ImportResult> {
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
          city: row.city || null,
          batch: row.batch || null,
          joined_as: row.joined_as,
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

    revalidatePath("/admin/ambassadors");

    return {
      ok: created.length > 0,
      message:
        failed.length === 0
          ? `Added ${created.length} ambassador${created.length === 1 ? "" : "s"}.`
          : `Added ${created.length}, skipped ${failed.length}.`,
      created,
      failed,
    };
  } catch (err) {
    return { ...empty, ...fail(err) };
  }
}
