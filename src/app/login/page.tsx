import { redirect } from "next/navigation";
import { Clapperboard, ClipboardList, Gift } from "lucide-react";

import { LoginForm } from "./login-form";
import { Card, CardBody } from "@/components/ui/card";
import { getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Sign in" };

const PITCH = [
  { icon: ClipboardList, tint: "bg-poll-tint text-poll", text: "Share surveys, earn for every genuine response" },
  { icon: Clapperboard, tint: "bg-reel-tint text-reel", text: "Complete Instagram tasks and upload proof" },
  { icon: Gift, tint: "bg-invite-tint text-invite", text: "Get credited for every app download you drive" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // No project configured means demo mode — there is nothing to sign in to.
  if (!isSupabaseConfigured()) redirect("/dashboard");

  // Already signed in? Don't make them do it twice.
  if (await getUser()) redirect("/dashboard");

  const { next } = await searchParams;

  return (
    // The explicit 1fr row matters: with an implicit `auto` row, `min-h-dvh`
    // stretches the container but leaves the row at content height, so the
    // gradient panel stops short of the bottom of the screen.
    <div className="grid min-h-dvh grid-rows-[minmax(0,1fr)] lg:grid-cols-2">
      {/* ── Pitch panel. Hidden on phones, where it would just push the
             form below the fold. ───────────────────────────────────── */}
      <aside className="bg-brand-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <p className="relative z-10 text-[18px] font-semibold tracking-tight">
          DailyMattr
        </p>

        <div className="relative z-10">
          <h1 className="max-w-sm text-[34px] leading-[1.15] font-semibold tracking-tight">
            The work you already do, finally counted.
          </h1>

          <ul className="mt-8 space-y-4">
            {PITCH.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-white/15 backdrop-blur-sm">
                  <Icon className="size-4.5" />
                </span>
                <span className="text-[14px] text-white/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-[12.5px] text-white/60">
          Student ambassador programme
        </p>

        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-white/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-white/10 blur-3xl"
        />
      </aside>

      {/* ── Form ─────────────────────────────────────────────────────── */}
      <main className="grid place-items-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center lg:text-left">
            <p className="text-brand-gradient text-[17px] font-semibold tracking-tight lg:hidden">
              DailyMattr
            </p>
            <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-ink lg:mt-0">
              Welcome back
            </h2>
            <p className="mt-1.5 text-[13.5px] text-ink-soft">
              Sign in to your ambassador account.
            </p>
          </div>

          <Card className="edge-light">
            <CardBody>
              <LoginForm next={next ?? "/dashboard"} />
            </CardBody>
          </Card>

          <p className="mt-6 text-center text-[12.5px] leading-relaxed text-ink-soft">
            Accounts are created by the DailyMattr team. If you can&apos;t get
            in, ask whoever invited you to re-send your invite.
          </p>
        </div>
      </main>
    </div>
  );
}
