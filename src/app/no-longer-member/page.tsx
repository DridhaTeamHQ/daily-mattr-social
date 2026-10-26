import { MessageCircle, UserX } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/login/actions";
import { publicEnv, serverEnv } from "@/lib/env";

export const metadata = { title: "No longer a member" };

/**
 * Where a suspended ambassador lands once somebody new has taken their place.
 *
 * The sign-in action sends them here instead of saying "wrong password": the
 * password was right, but the slot is somebody else's now, and the only way
 * back is through the team — so the one button on the page is the way to ask.
 */
export default function NoLongerMemberPage() {
  // Same contact as an expired link: NEXT_PUBLIC_CONTACT_URL when it is set,
  // otherwise the address the welcome email came from.
  const sender = serverEnv().brevoSenderEmail;
  const contactHref =
    publicEnv.contactUrl ??
    (sender
      ? `mailto:${sender}?subject=${encodeURIComponent("My dailymattr ambassador account")}`
      : null);

  return (
    <AuthShell
      title="You're no longer a member"
      description="Your dailymattr ambassador account is no longer active. If you think this is a mistake, please contact HR."
      footer={
        // A session that reached the dashboard is still alive; this ends it,
        // so the sign-in page doesn't bounce them straight back here.
        <form action={signOut}>
          <button type="submit" className="font-bold text-brand-strong hover:underline">
            Back to sign in
          </button>
        </form>
      }
    >
      <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
        <UserX aria-hidden className="mt-0.5 size-5 shrink-0 text-rose-700" />
        <p className="text-[13.5px] leading-relaxed font-medium text-rose-900">
          You can&apos;t sign in to the ambassador programme any more. Contact
          HR to find out more or to ask about rejoining.
        </p>
      </div>

      {contactHref && (
        <Button asChild className="mt-6 w-full">
          <a
            href={contactHref}
            {...(/^https?:/i.test(contactHref)
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            <MessageCircle aria-hidden />
            Contact HR
          </a>
        </Button>
      )}
    </AuthShell>
  );
}
