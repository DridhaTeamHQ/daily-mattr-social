/**
 * Creates (or promotes) an admin account.
 *
 *   npm run admin -- <email> <password> ["Full Name"]
 *
 * If the user already exists, their password is reset and they are promoted to
 * admin rather than a second account being made. The `profiles` row is written
 * by the `on_auth_user_created` trigger; this script updates role/status
 * afterwards because the trigger only reads user metadata at insert time.
 *
 * Pass the password on the command line only on a machine you trust — it lands
 * in your shell history.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const [email, password, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ") || "Admin";

if (!email || !password) {
  console.error('Usage: npm run admin -- <email> <password> ["Full Name"]');
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: list, error: listError } = await db.auth.admin.listUsers({
    perPage: 200,
  });
  if (listError) throw listError;

  const existing = list.users.find((u) => u.email === email);
  let userId: string;

  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "admin" },
    });
    if (error) throw error;
    userId = existing.id;
    console.log(`Updated existing user ${email}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "admin" },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created user ${email}`);
  }

  // The trigger fires on insert only, so an existing ambassador being promoted
  // still needs role and status set here.
  const { error: profileError } = await db
    .from("profiles")
    .update({ role: "admin", status: "active", full_name: fullName })
    .eq("id", userId);
  if (profileError) throw profileError;

  const { data: profile } = await db
    .from("profiles")
    .select("email, full_name, role, status")
    .eq("id", userId)
    .single();

  console.log("\nAdmin ready:");
  console.table([profile]);
}

main().catch((err) => {
  console.error("\nFailed:", err.message ?? err);
  process.exit(1);
});
