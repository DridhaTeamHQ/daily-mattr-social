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
      {/* The fill is the darker end of the brand ramp, not #3979ff. White on
          #3979ff measures 3.9:1 and fails on a phone in daylight, which is
          where this app is actually read; #2d67e8 into #2453b8 runs 4.9:1 to
          7:1, so every white mark on this panel clears AA. Deepening the blue
          is what buys the white type. */}
      {/* The right padding is the mascot's lane. Before it, the figure was
          positioned over the content and cleared the pitch rows by as little
          as 5px — one browser zoom step and the text ran into the sticker,
          where white type on a white outline simply disappears. Reserving the
          strip means the two can never meet, at any width or height. Widen the
          figure and this padding has to grow with it. */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-strong to-brand-press lg:flex lg:flex-col lg:justify-between lg:p-14 xl:pr-[11rem] 2xl:pr-[15rem]">
        <Wordmark
          label="DailyMattr"
          className="relative z-20 h-[34px] w-auto text-white"
        />

        <div className="relative z-20 max-w-lg">
          {/* Sized so "THE WORK YOU" always fits one line, which is what keeps
              the sentence at two lines instead of three. The binding width is
              the narrowest point of each range — 412px at lg, 423px at xl,
              491px at 2xl — and the line measures 8.52px per step of font
              size. Every step here clears its width by 14-20px. Raise any of
              them, or widen the mascot's lane, and the line breaks after
              "WORK" and the sentence runs to three again. */}
          <h1 className="display text-[46px] leading-[0.94] text-white xl:text-[48px] 2xl:text-[56px]">
            The work you already do,
            {/* The emphasis slab inverts rather than going black: one white
                block holding blue is the only mark on the panel that isn't
                white, so it lands as the emphasis without a second colour. */}
            <span className="mt-3 block w-fit bg-white px-3 py-1 text-brand-press">
              finally counted.
            </span>
          </h1>

          <ul className="mt-10 space-y-4">
            {PITCH.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3.5">
                {/* One shape and one colour for all three. Giving each its own
                    accent made a plain list of facts read like three unrelated
                    alerts. The hairline keeps the tile legible where the
                    gradient is at its darkest. */}
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
                  <Icon className="size-5 text-white" />
                </span>
                <span className="text-[15.5px] font-bold text-white">
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-20 text-[13px] font-bold text-white/75">
          Student ambassador programme
        </p>

        {/* Bled off the bottom-right, inside the lane the padding above keeps
            clear. Hidden below xl, where the panel is not wide enough to hold
            both the headline and the figure — decoration over copy is worse
            than no decoration. Note the 3deg rotation widens the laid-out box
            by ~8%, which is why the figure is narrower than the lane. */}
        <Image
          src="/mascot.png"
          alt=""
          aria-hidden
          width={628}
          height={899}
          priority
          className="pointer-events-none absolute -right-16 -bottom-12 z-10 hidden h-auto w-[13rem] rotate-3 select-none xl:block 2xl:w-[17rem]"
        />

        {/* Soft tonal shapes rather than hard outlines: at this size the 3px
            black rings competed with the headline for attention. Both lift the
            fill now instead of darkening it — a black shape on a panel whose
            every mark is white read as a smudge. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-24 size-96 rotate-12 rounded-[3rem] bg-white/5"
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
