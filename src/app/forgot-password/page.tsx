import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { Note } from "@/components/ui/feedback";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };

const ERRORS: Record<string, string> = {
  expired:
    "That link has already been used or has expired. Request a new one below.",
  missing: "That link was incomplete. Request a new one below.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const notice = error ? ERRORS[error] : null;

  return (
    <AuthShell
      title="Forgot your password?"
      description="Put in the email you sign in with and we'll send you a link to set a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-bold text-brand-strong hover:underline">
            Back to sign in
          </Link>
          .
        </>
      }
    >
      {notice && (
        <Note tone="warn" className="mb-4">
          {notice}
        </Note>
      )}

      <ForgotPasswordForm />
    </AuthShell>
  );
}
