import Image from "next/image";
import { redirect } from "next/navigation";
import { Clapperboard, ClipboardList, Gift, Zap } from "lucide-react";

import { LoginForm } from "./login-form";
import { Card, CardBody } from "@/components/ui/card";
import { getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Sign in" };

const PITCH = [
  {
    icon: ClipboardList,
    fill: "bg-poll",
    text: "Share surveys, earn for every genuine response",
  },
  {
    icon: Clapperboard,
    fill: "bg-reel",
    text: "Complete Instagram tasks and upload proof",
  },
  {
    icon: Gift,
    fill: "bg-invite",
    text: "Get credited for every app download you drive",
  },
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
    // colour panel stops short of the bottom of the screen.
    <div className="grid min-h-dvh grid-rows-[minmax(0,1fr)] lg:grid-cols-2">
      {/* ── Pitch panel. Hidden on phones, where it would just push the
             form below the fold. ───────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden border-r-[3px] border-ink bg-brand p-12 lg:flex lg:flex-col lg:justify-between">
        <p className="display relative z-10 text-[22px] text-ink">DailyMattr</p>

        <div className="relative z-10">
          <h1 className="display max-w-md text-[46px] leading-[0.92] text-ink">
            The work you already do,
            <span className="mt-2 block bg-reel px-2 py-1 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
              finally counted.
            </span>
          </h1>

          <ul className="mt-9 space-y-3.5">
            {PITCH.map(({ icon: Icon, fill, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span
                  className={`brut-sm grid size-10 shrink-0 place-items-center rounded-sm ${fill}`}
                >
                  <Icon className="size-5 text-ink" />
                </span>
                <span className="text-[14.5px] font-bold text-ink">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="brut-sm relative z-10 inline-flex w-fit items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-extrabold text-ink">
          <Zap className="size-3.5" fill="currentColor" />
          Student ambassador programme
        </p>

        {/* Die-cut sticker, bled off the bottom-right corner.
            `hidden xl:block` because below that width the panel isn't wide
            enough to hold both the headline and the figure, and decoration
            over copy is worse than no decoration. */}
        <Image
          src="/mascot.png"
          alt=""
          aria-hidden
          width={628}
          height={899}
          priority
          className="pointer-events-none absolute -right-16 -bottom-14 z-0 hidden h-auto w-[17rem] rotate-3 select-none xl:block 2xl:w-[21rem]"
        />

        {/* Oversized outlined marks — decoration only, nothing readable
            sits on them. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 size-64 rounded-full border-[3px] border-ink"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-20 size-72 rotate-12 rounded-lg border-[3px] border-ink"
        />
      </aside>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <main className="grid place-items-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center lg:text-left">
            <p className="display text-[20px] text-ink lg:hidden">DailyMattr</p>
            <h2 className="display mt-3 text-[30px] leading-none text-ink lg:mt-0">
              Welcome back
            </h2>
            <p className="mt-2 text-[13.5px] font-semibold text-ink-soft">
              Sign in to your ambassador account.
            </p>
          </div>

          <Card>
            <CardBody>
              <LoginForm next={next ?? "/dashboard"} />
            </CardBody>
          </Card>

          <p className="mt-6 text-center text-[12.5px] leading-relaxed font-medium text-ink-soft">
            Accounts are created by the DailyMattr team. If you can&apos;t get
            in, ask whoever added you to reset your password.
          </p>
        </div>
      </main>
    </div>
  );
}
