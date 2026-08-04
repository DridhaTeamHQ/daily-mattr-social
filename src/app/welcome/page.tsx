import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { WelcomeForm } from "./welcome-form";
import { Wordmark } from "@/components/logo";
import { Card, CardBody } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Choose a password" };

export default async function WelcomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  // Nothing to do here once they've picked their own password.
  if (!profile?.must_change_password) redirect("/dashboard");

  const firstName = (profile.full_name || "").split(" ")[0];

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* This is the first screen a new ambassador ever sees, and the only
              one with no nav — the mark is how they know whose app this is. */}
          <Wordmark
            label="DailyMattr"
            className="mx-auto mb-7 block h-5 w-auto text-brand"
          />

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
