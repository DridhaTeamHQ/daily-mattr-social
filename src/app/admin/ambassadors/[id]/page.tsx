import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clapperboard, ClipboardList, Flame, Gift, Trophy } from "lucide-react";

import { AchievementForm } from "@/components/achievement-form";
import { MilestoneProgress } from "@/components/milestone-runner";
import { AmbassadorDetailsDialog } from "@/components/ambassador-details-dialog";
import { ActionButton } from "@/components/action-button";
import { ReasonDialog } from "@/components/reason-dialog";
import { ResetPasswordDialog } from "@/components/ambassador-actions";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { setAmbassadorStatus } from "@/lib/admin/actions";
import { deleteAchievement } from "@/lib/admin/edit-actions";
import { getAmbassadorDetail, requireAdmin } from "@/lib/admin/queries";
import { getViewingVersion } from "@/lib/programme-version";
import { createCachedClient as createClient } from "@/lib/admin/cached-client";
import { formatDate, initials } from "@/lib/utils";

export const metadata = { title: "Ambassador" };

const STATUS_TONE = { active: "ok", invited: "warn", suspended: "bad" } as const;

export default async function AmbassadorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [, { id }, supabase, version] = await Promise.all([
    requireAdmin(),
    params,
    createClient(),
    getViewingVersion(),
  ]);

  /**
   * The same figure the ambassador sees on their own dashboard.
   *
   * Read from `ambassador_completion` rather than recomputed from the
   * submissions below, because those two would drift: the list here is every
   * submission ever made, while completion is about this month's task pool and
   * counts a task once however many attempts it took. An admin quoting a
   * number back to a student needs it to be the student's number.
   *
   * Not read off `completion_leaderboard` either, though that is where the
   * student's copy comes from. The board stops at its row limit and only
   * includes active profiles, so picking a row out of it would report a
   * confident 0% for a suspended ambassador and for anyone past the cut —
   * and this page is exactly where a suspended person gets opened. The RPC
   * is the same arithmetic addressed by id. Migration 0033 has the detail.
   *
   * Rank still comes from the board, because a rank only means anything
   * relative to the people being ranked; when they are not on it, the line
   * simply omits the rank instead of inventing one.
   *
   * All three are fetched at once. They used to wait on each other, and the
   * detail query was also paging through the whole programme's ledger for a
   * points rank this page never shows — `withRank: false` skips that.
   */
  const [data, { data: completion }, { data: board }] = await Promise.all([
    getAmbassadorDetail(id, 30, { withRank: false }),
    supabase.rpc("ambassador_completion", { target: id, p_version: version }),
    supabase.rpc("completion_leaderboard", {
      limit_count: 1000,
      p_version: version,
    }),
  ]);
  if (!data) notFound();

  const { profile, streak, referrals } = data;
  const name = profile.full_name || profile.email;
  const approved = data.submissions.filter(
    (submission) => submission.status === "approved" || submission.status === "auto_approved",
  ).length;
  const responses = data.surveys.reduce((total, survey) => total + survey.responses, 0);

  const progress = completion?.[0] ?? null;
  const completionPct = progress?.completion_pct ?? 0;
  /**
   * Their rank as they see it: inside their own batch.
   *
   * An admin reads the whole programme off this RPC — that is the exemption
   * the function makes for them — so the `position` on the row is the
   * programme-wide one, and quoting it back would contradict the number on
   * the student's own screen. Counting the peers ahead of them reproduces
   * the board's scope, ties included: two people sharing a position are both
   * ahead of nobody, so they share a rank here too.
   */
  const mine = (board ?? []).find((row) => row.ambassador_id === id) ?? null;
  const peers = mine?.batch
    ? (board ?? []).filter((row) => row.batch === mine.batch)
    : (board ?? []);
  const rank = mine
    ? peers.filter((row) => row.position < mine.position).length + 1
    : null;

  const meta = [profile.college, profile.city, profile.batch].filter(Boolean).join(" · ");

  return (
    <div className="stagger space-y-5">
      <div>
        <Link
          href="/admin/ambassadors"
          className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Ambassadors
        </Link>
      </div>

      {/* ─── Header ──────────────────────────────────────────────────────────
          Drawn like the campaign page's: a saturated card with white text,
          the initials on a white tile in the card's own colour. */}
      <Card className="bg-brand">
        <CardBody className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden
            className="display grid size-14 shrink-0 place-items-center rounded-xl bg-white text-[17px] text-brand"
          >
            {initials(name)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="display text-[24px] leading-none text-white">
                {profile.full_name || "-"}
              </h1>
              <Badge tone={STATUS_TONE[profile.status]} dot>
                {profile.status}
              </Badge>
              {streak > 0 && (
                <Badge tone="neutral">
                  <Flame className="size-3.5 text-flame" fill="currentColor" />
                  {streak} day{streak === 1 ? "" : "s"}
                </Badge>
              )}
            </div>

            <p className="mt-2 text-[13.5px] font-semibold text-white/95">
              {profile.email}
              {meta ? ` · ${meta}` : ""}
            </p>
            <p className="mt-1 text-[12.5px] font-semibold text-white/85">
              Code <span className="font-extrabold text-white">{profile.referral_code}</span>
              {" · "}joined {formatDate(profile.created_at)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <AmbassadorDetailsDialog
              profile={{
                id: profile.id,
                full_name: profile.full_name,
                college: profile.college,
                city: profile.city,
                batch: profile.batch,
                referral_code: profile.referral_code,
              }}
            />
            <ResetPasswordDialog profileId={profile.id} name={name} variant="secondary" />
            {profile.status === "suspended" ? (
              <ActionButton
                size="sm"
                variant="secondary"
                action={setAmbassadorStatus.bind(null, profile.id, "active")}
              >
                Reinstate
              </ActionButton>
            ) : (
              <ReasonDialog
                title={`Suspend ${name}`}
                description="They keep their login and history but cannot participate. The reason is sent to them and stays on their record."
                label="Reason"
                placeholder="Screenshots did not match the campaign"
                confirmLabel="Suspend"
                action={setAmbassadorStatus.bind(null, profile.id, "suspended")}
                trigger={
                  <Button size="sm" variant="secondary">
                    Suspend
                  </Button>
                }
              />
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Approved tasks"
          value={approved}
          sub={`${data.submissions.length} submitted`}
          icon={Clapperboard}
          tone="reel"
        />
        <Stat
          label="Survey responses"
          value={responses}
          sub={`${data.surveys.length} link${data.surveys.length === 1 ? "" : "s"} issued`}
          icon={ClipboardList}
          tone="poll"
        />
        <Stat
          label="Installs"
          value={referrals.counted}
          sub={referrals.last ? `Last ${formatDate(referrals.last)}` : "None confirmed"}
          icon={Gift}
          tone="invite"
        />
      </div>

      {/* The same track the ambassador sees, so a conversation about "where am
          I" is had over one picture rather than two different ones. */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="display text-[16px] text-ink">Task completion</h2>
            <p className="text-[12.5px] font-semibold text-ink-soft">
              {progress && progress.total_tasks > 0
                ? `${progress.approved_tasks} of ${progress.total_tasks} tasks approved this month${rank ? ` · rank #${rank}${mine?.batch ? ` in ${mine.batch}` : ""}` : ""}`
                : "No tasks running this month"}
            </p>
          </div>
          <p className="mt-1 text-[28px] leading-none font-extrabold text-ink">
            {completionPct}%
          </p>
          <MilestoneProgress pct={completionPct} className="relative mt-4" />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardBody>
            <SectionTitle title="Task submissions" count={data.submissions.length} />
            {data.submissions.length === 0 ? (
              <EmptyState
                icon={Clapperboard}
                title="Nothing submitted"
                description="They have not uploaded proof for any campaign task yet."
              />
            ) : (
              <ul className="mt-3 divide-y divide-gray-100">
                {data.submissions.map((submission) => (
                  <li key={submission.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-extrabold text-ink">
                        {submission.campaign}
                      </p>
                      <p className="truncate text-[12px] font-semibold text-ink-soft">
                        {submission.taskLabel} · {formatDate(submission.uploadedAt)}
                      </p>
                    </div>
                    <StatusBadge status={submission.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <SectionTitle title="Survey links" count={data.surveys.length} />
            {data.surveys.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No survey links issued" />
            ) : (
              <ul className="mt-3 divide-y divide-gray-100">
                {data.surveys.map((survey) => (
                  <li key={survey.surveyId} className="flex items-center gap-3 py-3">
                    <p className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold text-ink">
                      {survey.title}
                    </p>
                    <p className="shrink-0 text-[12px] font-semibold text-ink-soft">
                      {survey.clicks} clicks · {survey.responses} responses
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ─── Achievements ────────────────────────────────────────────────────
          Everything else on this page is counted by the system. This is the
          part somebody has to write down: the stall they ran, the person they
          helped, the thing no query will ever find. */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="display text-[16px] text-ink">Achievements</h2>
              <p className="mt-1 text-[12.5px] text-ink-soft">
                Written by you, and shown to {profile.full_name || "them"} on
                their stipend page.
              </p>
            </div>
            <Trophy className="size-5 shrink-0 text-ink-soft" />
          </div>

          <AchievementForm ambassadorId={profile.id} />

          {data.achievements.length === 0 ? (
            <p className="mt-4 text-[13px] text-ink-soft">
              Nothing recorded yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-100">
              {data.achievements.map((achievement) => (
                <li
                  key={achievement.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-extrabold text-ink">
                      {achievement.title}
                    </p>
                    {achievement.note && (
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">
                        {achievement.note}
                      </p>
                    )}
                    <p className="mt-0.5 text-[12px] text-ink-faint">
                      {formatDate(achievement.awarded_at)}
                    </p>
                  </div>

                  <ActionButton
                    size="sm"
                    variant="secondary"
                    action={deleteAchievement.bind(
                      null,
                      achievement.id,
                      profile.id,
                    )}
                    confirmMessage={`Remove "${achievement.title}"? They will stop seeing it.`}
                  >
                    Remove
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="display text-[16px] text-ink">{title}</h2>
      {count > 0 && (
        <span className="text-[12.5px] font-semibold text-ink-soft">{count}</span>
      )}
    </div>
  );
}
