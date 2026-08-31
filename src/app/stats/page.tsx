import { notFound } from "next/navigation";
import { ClipboardList, Coins, Download, Users } from "lucide-react";

import { Wordmark } from "@/components/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatNumber } from "@/lib/utils";

export const metadata = {
  // Bare, because the root layout's template already appends
  // "· DailyMattr Socials".
  title: "By the numbers",
  description:
    "How the dailymattr student ambassador programme is going, in four numbers.",
};

// Recomputed at most every ten minutes. This is the one page strangers can
// reach, so it should not run four aggregate queries per visit, and nobody
// needs a live counter to be convinced the programme is real.
export const revalidate = 600;

/**
 * The public transparency page.
 *
 * Four totals and nothing else — no names, no colleges, no leaderboard.
 * `public_stats()` is the only function `anon` may execute, and it returns
 * aggregates by construction, so there is nothing here that could leak a
 * particular student even if this page were wrong about what to render.
 *
 * Doubles as recruitment: "312 ambassadors, 4,100 responses" is the most
 * persuasive thing that can be said to the next batch, and it is verifiable
 * rather than a claim.
 */
export default async function PublicStatsPage() {
  const db = createAdminClient();

  const [{ data: stats }, { data: setting }] = await Promise.all([
    db.rpc("public_stats"),
    db.from("app_settings").select("value").eq("key", "public_stats_enabled").maybeSingle(),
  ]);

  // Off by default if the row is missing or explicitly false: a public page
  // should fail closed.
  if (setting?.value === false) notFound();

  const row = stats?.[0];
  if (!row) notFound();

  const figures = [
    {
      icon: Users,
      value: Number(row.ambassadors),
      label: "Student ambassadors",
      hint: "Active on the programme right now",
    },
    {
      icon: ClipboardList,
      value: Number(row.responses),
      label: "Survey responses",
      hint: "Collected and verified",
    },
    {
      icon: Download,
      value: Number(row.downloads),
      label: "App downloads",
      hint: "Driven by ambassador referrals",
    },
    {
      icon: Coins,
      value: Number(row.points),
      label: "Points awarded",
      hint: "Earned by students for real work",
    },
  ];

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto max-w-4xl px-5 py-16 sm:py-24">
        <Wordmark
          label="dailymattr"
          className="h-[34px] w-auto text-brand-strong"
        />

        <h1 className="display mt-8 text-[34px] leading-[1.05] text-gray-900 sm:text-[44px]">
          The ambassador programme,
          <br />
          by the numbers.
        </h1>

        <p className="mt-4 max-w-xl text-[15px] leading-relaxed font-medium text-gray-500">
          Students across Hyderabad, Vijayawada and Warangal run surveys, post
          on social, and get their friends onto dailymattr. Everything they do
          converts to points, and the points convert to money.
        </p>

        <dl className="mt-12 grid gap-4 sm:grid-cols-2">
          {figures.map((figure) => {
            const Icon = figure.icon;
            return (
              <div
                key={figure.label}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-6"
              >
                <Icon className="size-5 text-brand-strong" />
                <dd className="display mt-3 text-[38px] leading-none text-gray-900">
                  {formatNumber(figure.value)}
                </dd>
                <dt className="mt-2 text-[14px] font-extrabold text-gray-900">
                  {figure.label}
                </dt>
                <p className="mt-1 text-[12.5px] font-semibold text-gray-500">
                  {figure.hint}
                </p>
              </div>
            );
          })}
        </dl>

        <p className="mt-12 text-[12.5px] font-semibold text-gray-400">
          Updated every few minutes. No personal information is shown on this
          page.
        </p>
      </div>
    </main>
  );
}
