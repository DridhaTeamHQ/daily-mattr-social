import nextEnv from "@next/env";
import { createAdminClient } from "../src/lib/supabase/admin";

nextEnv.loadEnvConfig(process.cwd());
// HEAD only: never fetches row bodies and never writes anything to Redis.
const inspect: typeof fetch = async (input, init) => {
  if (init?.method !== "HEAD") throw new Error("Diagnostic only permits HEAD");
  const response = await fetch(input, init);
  const cookieNames = (response.headers.getSetCookie?.() ?? [])
    .map(cookie => cookie.split("=", 1)[0]);
  console.log(JSON.stringify({ status: response.status,
    hasSetCookie: response.headers.has("set-cookie"), cookieNames,
    contentType: response.headers.get("content-type"),
    oldCacheWouldReject: response.headers.has("set-cookie") }));
  return response;
};

try {
  const { error } = await createAdminClient(inspect)
    .from("campaigns").select("id", { head: true }).limit(1);
  if (error) throw new Error("HEAD query failed");
} catch {
  console.error("Header diagnostic failed; credentials and response bodies are not printed.");
  process.exitCode = 1;
}
