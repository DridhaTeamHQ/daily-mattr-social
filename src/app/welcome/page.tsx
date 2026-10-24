import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { WelcomeForm } from "./welcome-form";
import { Card, CardBody } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { isTempPasswordExpired } from "@/lib/temp-password";

export const metadata = { title: "Choose a password" };

export default async function WelcomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, must_change_password, temp_password_expires_at")
    .eq("id", user.id)
    .maybeSingle();

  // Nothing to do here once they've picked their own password.
  if (!profile?.must_change_password) redirect("/dashboard");

  // Signed in before the 5 days ran out and came back after: the session is
  // still good, but the temporary password it was opened with is not.
  if (isTempPasswordExpired(profile)) {
    await supabase.auth.signOut();
    redirect("/link-expired");
  }

  const firstName = (profile.full_name || "").split(" ")[0];

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span
            aria-hidden
            className="brut animate-wiggle mx-auto grid size-16 place-items-center rounded-md bg-brand text-ink"
          >
            <KeyRound className="size-6" />
          </span>

          <h1 className="display mt-5 text-[30px] leading-none text-ink">
            {firstName ? `Welcome, ${firstName}` : "Welcome"}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            Your admin gave you a temporary password. Pick your own to finish
            setting up — it takes ten seconds and nobody else will know it.
          </p>
        </div>

        <Card>
          <CardBody>
            <WelcomeForm />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
