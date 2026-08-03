import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Demo mode has no auth to perform — send people straight to the app.
  if (!isSupabaseConfigured()) redirect("/dashboard");

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-[17px] font-semibold tracking-tight text-ink">
            DailyMattr
          </p>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Sign in to your ambassador account
          </p>
        </div>

        <Card>
          <CardBody className="space-y-4">
            {/* Wired up in the next step — the auth action doesn't exist yet. */}
            <Field label="Email" htmlFor="email" required>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@college.edu"
                disabled
              />
            </Field>

            <Button className="w-full" size="lg" disabled>
              Send me a link
            </Button>

            <Note tone="warn">
              Sign-in isn&apos;t wired up yet. It lands with the auth step, once
              a Supabase project is connected.
            </Note>
          </CardBody>
        </Card>

        <p className="mt-5 text-center text-[12.5px] text-ink-soft">
          <Link href="/dashboard" className="text-brand hover:text-brand-hover">
            Back to the app
          </Link>
        </p>
      </div>
    </div>
  );
}
