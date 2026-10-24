import Link from "next/link";
import { Clock, MessageCircle } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { publicEnv, serverEnv } from "@/lib/env";
import { TEMP_PASSWORD_DAYS } from "@/lib/temp-password";

export const metadata = { title: "Link expired" };

/**
 * Where an ambassador lands when their login email is more than 5 days old.
 *
 * The sign-in action sends them here instead of saying "wrong password": the
 * password was right, it has just run out, and the only way forward is a new
 * email from the team — so the one button on the page is the way to ask.
 */
export default function LinkExpiredPage() {
  // NEXT_PUBLIC_CONTACT_URL when it is set; otherwise the address the
  // welcome email came from, which is the one they already have.
  const sender = serverEnv().brevoSenderEmail;
  const contactHref =
    publicEnv.contactUrl ??
    (sender
      ? `mailto:${sender}?subject=${encodeURIComponent("My dailymattr login link has expired")}`
      : null);

  return (
    <AuthShell
      title="Your link has expired"
      description={`Login details from the welcome email work for ${TEMP_PASSWORD_DAYS} days, and these were not used in time. Ask the dailymattr team and they'll send you a fresh set.`}
      footer={
        <>
          Already got a new email?{" "}
          <Link href="/login" className="font-bold text-brand-strong hover:underline">
            Sign in with it
          </Link>
          .
        </>
      }
    >
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <p className="text-[13.5px] leading-relaxed font-medium text-amber-900">
          For your account&apos;s safety, the temporary password stopped
          working {TEMP_PASSWORD_DAYS} days after it was sent.
        </p>
      </div>

      {contactHref && (
        <Button asChild className="mt-6 w-full">
          {/* A new tab for a web link (WhatsApp, a form); a mailto opens the
              mail app either way, and a new tab would just sit there blank. */}
          <a
            href={contactHref}
            {...(/^https?:/i.test(contactHref)
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            <MessageCircle aria-hidden />
            Contact us
          </a>
        </Button>
      )}
    </AuthShell>
  );
}
