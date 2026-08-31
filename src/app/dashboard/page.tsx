import { redirect } from "next/navigation";
import { after } from "next/server";
import { ClipboardCheck, ClipboardList, Gift } from "lucide-react";

import { CompletionMilestoneWatcher } from "@/components/level-up";
import { InstallPodium } from "@/components/install-podium";
import { ProgressHero } from "@/components/points-hero";
import { Stat } from "@/components/ui/stat";
import { markActiveToday } from "@/lib/activity";
import { getDashboard, isDemoMode } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Home" };

/**
 * What each placing on the install board is worth saying.
 *
 * Written per rank rather than as "You're #N", because the whole point of the
 * badge is that it is worth screenshotting — and "#4 for installs" is a
 * statistic, not something anybody sends to a friend. Only the top five ever
 * see one; see `getInstallBoard`.
 */
const INSTALL_RANK_BADGE: Record<number, string> = {
  1: "#1. That's a flex",
  2: "#2. One spot to go",
  3: "#3. On the podium",
  4: "#4. Podium's in sight",
  5: "#5. Top five on campus",
};

export default async function DashboardPage() {
  const data = await getDashboard();
  if (!data) redirect("/login");

  const {
    profile,
    standing,
    campaigns,
    surveys,
    referrals,
    streak,
    installRank,
    installPodium,
  } = data;
  const openTasks = campaigns
    .flatMap((campaign) => campaign.tasks)
    .filter((task) => task.submission_status === null).length;
  const surveyResponses = surveys.reduce((total, survey) => total + survey.valid_responses, 0);
  const firstName = (profile.full_name || "there").trim().split(/\s+/)[0];
  const isNewcomer = standing.approvedTasks === 0 && surveyResponses === 0;
  const completionPct = standing.completionPct;
  const totalTasks = standing.totalTasks;
  const justApproved = data.notifications.some(
    (notification) => notification.type === "submission_approved" && !notification.read_at,
  );

  // Build the client here, not in the callback. `after` runs once the render
  // lifecycle is over, and a Server Component that reaches for `cookies()`
  // there throws — the Supabase client reads them, so it is created during the
  // render and closed over.
  if (!isDemoMode()) {
    const supabase = await createClient();
    after(() => markActiveToday(profile.id, supabase));
  }

  return (
    <div className="stagger space-y-7">
      <CompletionMilestoneWatcher completionPct={completionPct} />

      <header>
        <h1 className="text-[28px] font-black leading-tight tracking-tight text-ink sm:text-[34px]">
          Hey <span className="text-brand-strong">{firstName}</span>
        </h1>
        <p className="mt-1 text-[13.5px] font-semibold text-gray-500">
          {isNewcomer
            ? "Ready to make an impact? Complete your first task to start your monthly progress."
            : "Welcome back! Keep completing tasks to move up the ranking."}
        </p>
      </header>
      

      <section>
        <SectionHeader title="Your progress" />
        <div className="space-y-7">
          <ProgressHero
            rank={standing.position > 0 ? standing.position : null}
            total={standing.total}
            batch={standing.batch}
            streak={streak}
            completionPct={completionPct}
            totalTasks={totalTasks}
            celebrate={justApproved}
          />
                {/* Directly under the tiles, so it reads as the answer to the Installs
          number immediately above it rather than as an unrelated board. Renders
          nothing at all until somebody has referred an install. */}
      <InstallPodium
        rows={installPodium}
        me={{ installs: referrals.total_confirmed, rank: installRank }}
      />
        </div>
      </section>

                  



      <section>
        <SectionHeader title="Your tasks" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat
            label="Open tasks"
            value={openTasks}
            sub={openTasks === 0 ? "All caught up" : "Waiting for you"}
            icon={ClipboardCheck}
            tone="reel"
          />
          <Stat
            label="Responses"
            value={surveyResponses}
            sub={`${surveys.length} ${surveys.length === 1 ? "survey" : "surveys"}`}
            icon={ClipboardList}
            tone="poll"
          />
          {/* The placing is only ever set for the top few with at least one
              install — see `getInstallBoard`. Everyone else gets the tile they
              had, because a rank is only worth showing to someone it is good
              news for. */}
          <Stat
            label="Installs"
            value={referrals.total_confirmed}
            sub={
              referrals.last_conversion
                ? `Last ${formatDate(referrals.last_conversion)}`
                : "None yet"
            }
            badge={installRank ? INSTALL_RANK_BADGE[installRank] : undefined}
            icon={Gift}
            tone="invite"
            info={
              <>
                Installs take up to 24 hrs to show up. Got a new download? Give
                it a little time - it&rsquo;ll be counted! 💛
              </>
            }
          />
        </div>
      </section>

    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-4 px-1">
      <h2 className="text-[14px] font-black uppercase tracking-widest text-black">{title}</h2>
    </div>
  );
}
