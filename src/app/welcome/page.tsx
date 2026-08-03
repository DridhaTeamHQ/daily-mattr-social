import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { WelcomeForm } from "./welcome-form";
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
          <span
            aria-hidden
            className="bg-brand-gradient mx-auto grid size-14 place-items-center rounded-lg text-white shadow-glow"
          >
            <KeyRound className="size-6" />
          </span>

          <h1 className="mt-4 text-[24px] font-extrabold tracking-tight text-ink">
            {firstName ? `Welcome, ${firstName}` : "Welcome"}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            Your admin gave you a temporary password. Pick your own to finish
            setting up — it takes ten seconds and nobody else will know it.
          </p>
        </div>

        <Card className="edge-light">
          <CardBody>
            <WelcomeForm />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
