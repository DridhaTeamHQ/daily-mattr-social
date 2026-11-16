/**
 * One-off: fill in phone numbers for ambassadors who already have accounts.
 *
 * The import skips any email that is already registered, so a roster re-sent
 * with a phone column changes nothing. This matches each row to an existing
 * profile by email and writes the phone — and only the phone. Name, batch,
 * referral code, status and password are left alone, and nobody is emailed.
 *
 * Reads the same files the "Import CSV" screen does (.csv or .xlsx), through
 * the same readAmbassadorCsv, so header names are matched just as loosely.
 *
 *   npx tsx --conditions=react-server scripts/update-phones.mts \
 *     .local/roster.xlsx [--batch B,C] [--live]
 *
 * --batch limits it to profiles already in those batches. Without --live it
 * prints what it would change and writes nothing.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const { readAmbassadorCsv } = await import("../src/lib/admin/csv");
const { xlsxToCsv } = await import("../src/lib/admin/xlsx");
const { canonicalBatch } = await import("../src/lib/batches");

const file = process.argv[2];
const live = process.argv.includes("--live");
const batchArg = process.argv[process.argv.indexOf("--batch") + 1];
const batches = process.argv.includes("--batch")
  ? batchArg.split(",").map((b) => canonicalBatch(b.trim()))
  : null;
if (!file) throw new Error("Pass the CSV or Excel path.");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

let text: string;
if (/\.(xlsx|xlsm)$/i.test(file)) {
  const bytes = readFileSync(file);
  const read = await xlsxToCsv(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  if (!read.ok) throw new Error(read.message);
  console.log(`Read ${read.rows} rows from sheet "${read.sheet}"`);
  text = read.csv;
} else {
  text = readFileSync(file, "utf8");
}

const { rows, missingColumns } = readAmbassadorCsv(text);
if (missingColumns.length) throw new Error(`Missing columns: ${missingColumns.join(", ")}`);

// Paged, because a single select stops at 1000 rows.
const profiles: { id: string; email: string; full_name: string; phone: string | null; batch: string | null }[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("profiles")
    .select("id, email, full_name, phone, batch")
    .order("id")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  profiles.push(...data);
  if (data.length < 1000) break;
}

const byEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p]));

const changes: { id: string; email: string; name: string; batch: string | null; from: string | null; to: string }[] = [];
const notFound: string[] = [];
const noPhone: string[] = [];
let same = 0;
let otherBatch = 0;

for (const row of rows) {
  if (!row.email) continue;
  const phone = row.phone?.trim();
  if (!phone) {
    noPhone.push(row.email);
    continue;
  }
  const profile = byEmail.get(row.email.toLowerCase());
  if (!profile) {
    notFound.push(row.email);
    continue;
  }
  if (batches && !batches.includes(profile.batch)) {
    otherBatch += 1;
    continue;
  }
  if (profile.phone === phone) {
    same += 1;
    continue;
  }
  changes.push({
    id: profile.id,
    email: profile.email,
    name: profile.full_name,
    batch: profile.batch,
    from: profile.phone,
    to: phone,
  });
}

for (const c of changes) {
  console.log(`  ${c.batch ?? "-"} · ${c.name} · ${c.email} · ${c.from ?? "(none)"} → ${c.to}`);
}
console.log(
  `\n${changes.length} to update · ${same} already correct · ${noPhone.length} rows with no phone · ` +
    `${notFound.length} emails with no account` +
    (batches ? ` · ${otherBatch} in other batches` : ""),
);
for (const e of notFound) console.log(`  NO ACCOUNT ${e}`);

if (!live) {
  console.log("\nDry run. Nothing written. Re-run with --live to save these phone numbers.");
  process.exit(0);
}

let saved = 0;
for (const c of changes) {
  const { error: updateError } = await db.from("profiles").update({ phone: c.to }).eq("id", c.id);
  if (updateError) console.log(`  FAILED ${c.email}: ${updateError.message}`);
  else saved += 1;
}
console.log(`\nsaved ${saved} of ${changes.length}`);
