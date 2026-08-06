import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { getUser } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

/**
 * Reached only through /auth/recover, which has already exchanged the emailed
 * token for a session. So the guard here is simply "is there a session" — if
 * somebody opens this URL directly, they have nothing to update and are sent
 * to ask for a fresh link.
 */
export default async function ResetPasswordPage() {
  const user = await getUser();
  if (!user) redirect("/forgot-password?error=expired");

  return (
    <AuthShell
      title="Choose a new password"
      description={`You're signed in as ${user.email}. Pick something you'll remember — you'll use it to sign in from now on.`}
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
