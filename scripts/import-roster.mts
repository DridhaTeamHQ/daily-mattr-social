/**
 * One-off roster import, run from a terminal instead of the admin UI.
 *
 * It deliberately reuses the exact modules the "Import CSV" screen uses —
 * readAmbassadorCsv, tempPassword, nextReferralCode, canonicalCity/Batch and
 * sendAmbassadorWelcomeEmail — so a person created this way is
 * indistinguishable from one created through the app. The only thing skipped
 * is assertAdmin(), which is an authorization gate on a UI session, not part
 * of what an import does.
 *
 * The site URL MUST be passed in. getSiteUrl() falls back to whatever
 * NEXT_PUBLIC_SITE_URL says, which is localhost in .env.local — every student
 * would receive a login link pointing at a machine that is not theirs.
 *
 *   NEXT_PUBLIC_SITE_URL=https://…  npx tsx --conditions=react-server \
 *     scripts/import-roster.mts .local/roster.csv [--live]
 *
 * Without --live it prints what it would do and writes nothing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

// After dotenv, so an explicit shell value still wins over .env.local.
if (process.env.SITE_URL_OVERRIDE) {
  process.env.NEXT_PUBLIC_SITE_URL = process.env.SITE_URL_OVERRIDE;
}

const { readAmbassadorCsv, tempPassword } = await import("../src/lib/admin/csv");
const { canonicalBatch, canonicalCity } = await import("../src/lib/batches");
const { nextReferralCode } = await import("../src/lib/referral-code");
const { sendAmbassadorWelcomeEmail } = await import("../src/lib/ambassador-email");

const file = process.argv[2];
const live = process.argv.includes("--live");
if (!file) throw new Error("Pass the CSV path.");

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
if (!/^https:\/\//.test(site)) {
  throw new Error(
    `Refusing to run: NEXT_PUBLIC_SITE_URL is "${site}". The welcome email embeds it as the login link, so it has to be the real https site.`,
  );
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const { rows, missingColumns } = readAmbassadorCsv(readFileSync(file, "utf8"));
if (missingColumns.length) throw new Error(`Missing columns: ${missingColumns.join(", ")}`);

const valid = rows.filter((r) => !r.error);
console.log(`${rows.length} rows · ${valid.length} valid · login link ${site}/login`);
for (const r of rows.filter((r) => r.error)) {
  console.log(`  SKIP line ${r.line} ${r.email}: ${r.error}`);
}

if (!live) {
  console.log("\nDry run. Nothing written. Re-run with --live to create and email.");
  process.exit(0);
}

const created: { name: string; email: string; password: string; code: string; emailed: string }[] = [];
const failed: { email: string; reason: string }[] = [];

for (const row of valid) {
  const password = tempPassword();

  const { data, error } = await db.auth.admin.createUser({
    email: row.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: row.full_name, college: row.college || null },
  });

  if (error || !data?.user) {
    failed.push({
      email: row.email,
      reason: /already|registered|exists/i.test(error?.message ?? "")
        ? "Already has an account"
        : (error?.message ?? "Could not create"),
    });
    continue;
  }

  const code = await nextReferralCode(db, canonicalBatch(row.batch));

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
      referral_code: code,
    })
    .eq("id", data.user.id);

  if (profileError) {
    // Otherwise the address is held by an account nobody can finish setting up.
    await db.auth.admin.deleteUser(data.user.id).catch(() => {});
    failed.push({ email: row.email, reason: profileError.message });
    continue;
  }

  const delivery = await sendAmbassadorWelcomeEmail({
    email: row.email,
    fullName: row.full_name,
    password,
  }).catch((e) => ({ ok: false as const, reason: "failed" as const, message: String(e) }));

  created.push({
    name: row.full_name,
    email: row.email,
    password,
    code,
    emailed: delivery.ok ? "sent" : `NOT SENT (${"message" in delivery ? delivery.message : "failed"})`,
  });

  console.log(`  ${delivery.ok ? "✓" : "✗"} ${row.full_name} · ${row.email} · ${code}`);
}

const out = file.replace(/\.csv$/, "") + "-credentials.csv";
writeFileSync(
  out,
  ["Name,Email,Temporary password,Referral code,Emailed",
    ...created.map((c) => `"${c.name}","${c.email}","${c.password}","${c.code}","${c.emailed}"`)].join("\r\n"),
  "utf8",
);

console.log(`\ncreated ${created.length} · failed ${failed.length} · emailed ${created.filter((c) => c.emailed === "sent").length}`);
for (const f of failed) console.log(`  FAILED ${f.email}: ${f.reason}`);
console.log(`credentials written to ${out}`);
