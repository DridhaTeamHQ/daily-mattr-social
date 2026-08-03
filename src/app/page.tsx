import { redirect } from "next/navigation";

/**
 * There is no marketing page here — this app is only ever reached by an
 * ambassador who already has an account, or an admin. Send both to the app and
 * let `proxy.ts` bounce them to sign-in if they aren't authenticated.
 */
export default function RootPage() {
  redirect("/dashboard");
}
