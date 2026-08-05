import Image from "next/image";
import { redirect } from "next/navigation";
import { Clapperboard, ClipboardList, Gift } from "lucide-react";

import { Wordmark } from "@/components/logo";
import { LoginForm } from "./login-form";
import { getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Sign in" };

const PITCH = [
  {
    icon: ClipboardList,
    text: "Share surveys, earn for every genuine response",
  },
  {
    icon: Clapperboard,
    text: "Complete social tasks and upload your proof",
  },
  {
    icon: Gift,
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
    <div className="grid min-h-dvh grid-rows-[minmax(0,1fr)] lg:grid-cols-[1.05fr_1fr]">
      {/* ── Pitch panel ──────────────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-brand lg:flex lg:flex-col lg:justify-between lg:p-14">
        {/* Ink on the brand fill, never white — white on #3979ff is 3.9:1, and
            this is the largest type on the page. */}
        <Wordmark
          label="DailyMattr"
          className="relative z-20 h-[34px] w-auto text-ink"
        />

        <div className="relative z-20 max-w-lg">
          <h1 className="display text-[52px] leading-[0.94] text-ink 2xl:text-[60px]">
            The work you already do,
            <span className="mt-3 block w-fit bg-ink px-3 py-1 text-white">
              finally counted.
            </span>
          </h1>

          <ul className="mt-10 space-y-4">
            {PITCH.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3.5">
                {/* One shape and one colour for all three. Giving each its own
                    accent made a plain list of facts read like three unrelated
                    alerts. */}
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink/10">
                  <Icon className="size-5 text-ink" />
                </span>
                <span className="text-[15.5px] font-bold text-ink">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-20 text-[13px] font-bold text-ink/70">
          Student ambassador programme
        </p>

        {/* Bled off the bottom-right. Hidden below xl, where the panel is not
            wide enough to hold both the headline and the figure — decoration
            over copy is worse than no decoration. */}
        <Image
          src="/mascot.png"
          alt=""
          aria-hidden
          width={628}
          height={899}
          priority
          className="pointer-events-none absolute -right-20 -bottom-16 z-10 hidden h-auto w-[19rem] rotate-3 select-none xl:block 2xl:w-[23rem]"
        />

        {/* Soft tonal shapes rather than hard outlines: at this size the 3px
            black rings competed with the headline for attention. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-24 size-96 rotate-12 rounded-[3rem] bg-ink/5"
        />
      </aside>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <main className="grid place-items-center bg-white px-5 py-12">
        <div className="w-full max-w-[22rem]">
          <Wordmark
            label="DailyMattr"
            className="mx-auto mb-8 h-[30px] w-auto text-brand lg:hidden"
          />

          <h2 className="display text-[34px] leading-none text-ink">
            Welcome back
          </h2>
          <p className="mt-2.5 text-[14px] font-medium text-ink-soft">
            Sign in to your ambassador account.
          </p>

          {/* No Card wrapper. A bordered box inside an already-empty white
              column was a frame around nothing — the fields are the content. */}
          <div className="mt-7">
            <LoginForm next={next ?? "/dashboard"} />
          </div>

          <p className="mt-8 border-t border-gray-200 pt-5 text-[12.5px] leading-relaxed font-medium text-ink-soft">
            Accounts are created by the DailyMattr team. If you can&apos;t get
            in, ask whoever added you to reset your password.
          </p>
        </div>
      </main>
    </div>
  );
}
