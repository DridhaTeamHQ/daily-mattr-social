import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Clapperboard,
  ClipboardList,
  Coins,
  Flame,
  Gift,
  Trophy,
} from "lucide-react";

import {
  AdjustPointsDialog,
  ResetPasswordDialog,
} from "@/components/ambassador-actions";
import { ActionButton } from "@/components/action-button";
import { ReasonDialog } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { BarList, ChartCard, DataTable, DayBars } from "@/components/charts";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { setAmbassadorStatus } from "@/lib/admin/actions";
import { getAmbassadorDetail, requireAdmin } from "@/lib/admin/queries";
import { cn, formatDate, formatDelta, formatNumber, initials } from "@/lib/utils";

export const metadata = { title: "Ambassador" };

const STATUS_TONE = {
  active: "ok",
  invited: "warn",
  suspended: "bad",
} as const;

const LEDGER_LABEL: Record<string, string> = {
  survey_response: "Survey response",
  instagram_task: "Instagram task",
  referral: "Referral",
  manual_adjust: "Adjustment",
  revoke: "Reversed",
};

export default async function AmbassadorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const data = await getAmbassadorDetail(id);
  if (!data) notFound();

  const { profile, points, streak, referrals } = data;
  const name = profile.full_name || profile.email;

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

      {/* ─── Who ───────────────────────────────────────────────────────────── */}
      <Card className="bg-brand">
        <CardBody className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden
            className="brut display grid size-14 shrink-0 place-items-center rounded-full bg-surface text-[16px] text-ink"
          >
            {initials(name)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="display text-[24px] leading-none text-ink">
                {profile.full_name || "—"}
              </h1>
              <Badge tone={STATUS_TONE[profile.status]} dot>
                {profile.status}
              </Badge>
              {streak > 0 && (
                <span className="brut-sm inline-flex items-center gap-1 rounded-full bg-flame-tint px-2.5 py-1 text-[12px] font-extrabold text-ink">
                  <Flame className="size-3.5 text-flame" fill="currentColor" />
                  {streak} day{streak === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <p className="mt-1.5 text-[13px] font-semibold text-ink/75">
              {profile.email}
              {profile.college ? ` · ${profile.college}` : ""}
            </p>
            <p className="mt-0.5 text-[12.5px] font-semibold text-ink/60">
              Code{" "}
              <code className="font-mono font-bold text-ink">
                {profile.referral_code}
              </code>{" "}
              · joined {formatDate(profile.created_at)}
              {[profile.city, profile.batch].filter(Boolean).length > 0
                ? ` · ${[profile.city, profile.batch].filter(Boolean).join(" · ")}`
                : ""}
            </p>

            {/* The reason travels with the status. A suspension nobody can
                explain is one nobody can fairly reverse. */}
            {profile.status === "suspended" && profile.status_reason && (
              <p className="mt-2 rounded-lg bg-bad-tint px-3 py-2 text-[12.5px] font-semibold text-bad">
                Suspended: {profile.status_reason}
                {profile.status_changed_at
                  ? ` · ${formatDate(profile.status_changed_at)}`
                  : ""}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <AdjustPointsDialog profileId={profile.id} name={name} />
            <ResetPasswordDialog profileId={profile.id} name={name} />
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
                description="They keep their login and history but stop earning. The reason is sent to them and stays on their record."
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

      {/* ─── Headline numbers ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Points"
          value={points.total}
          sub={
            points.reversed > 0
              ? `${formatNumber(points.earned)} earned · ${formatNumber(points.reversed)} reversed`
              : "Nothing reversed"
          }
          icon={Coins}
          tone="brand"
        />
        <Stat
          label="Rank"
          value={points.rank ? `#${points.rank}` : "—"}
          sub={points.rank ? `of ${points.cohort} active` : "Not ranked"}
          icon={Trophy}
          tone="rank"
        />
        <Stat
          label="Survey responses"
          value={data.surveys.reduce((n, s) => n + s.responses, 0)}
          sub={`${data.surveys.length} link${data.surveys.length === 1 ? "" : "s"} issued`}
          icon={ClipboardList}
          tone="poll"
        />
        <Stat
          label="Installs"
          value={referrals.counted}
          sub={
            referrals.last
              ? `Last ${formatDate(referrals.last)}`
              : "None confirmed"
          }
          icon={Gift}
          tone="invite"
        />
      </div>

      {/* ─── Charts ────────────────────────────────────────────────────────── */}
      <ChartCard
        title="Their points, day by day"
        hint="Last 30 days. Empty days are shown, not skipped."
      >
        <DayBars data={data.pointsByDay} color="violet" />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Where their points come from"
          hint="Which part of the programme this person actually works."
        >
          <BarList
            data={data.earningsBySource}
            color="gold"
            emptyMessage="They haven't earned anything yet."
          />
          <DataTable
            caption="Points by source"
            rows={data.earningsBySource}
          />
        </ChartCard>

        <ChartCard
          title="Survey links"
          hint="Clicks are visits to their link; responses are the ones that counted."
        >
          {data.surveys.length === 0 ? (
            <p className="py-6 text-center text-[13px] font-semibold text-ink-soft">
              No survey links issued yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.surveys.map((s) => (
                <li key={s.surveyId} className="brut-sm rounded-sm bg-canvas-sunk p-3">
                  <p className="text-[13.5px] font-extrabold text-ink">
                    {s.title}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <Mini label="Clicks" value={s.clicks} />
                    <Mini label="Responses" value={s.responses} highlight />
                    <Mini label="Duplicates" value={s.duplicates} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      {/* ─── Submissions ───────────────────────────────────────────────────── */}
      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Screenshot submissions</h2>

          {data.submissions.length === 0 ? (
            <EmptyState
              icon={Clapperboard}
              title="Nothing submitted"
              description="They haven't uploaded a screenshot for any campaign task yet."
            />
          ) : (
            <ul className="mt-3 divide-y-[3px] divide-ink">
              {data.submissions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-extrabold text-ink">
                      {s.campaign}
                    </p>
                    <p className="text-[12px] font-semibold text-ink-soft">
                      {s.taskLabel} · +{s.points} ·{" "}
                      {formatDate(s.uploadedAt)}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ─── Ledger ────────────────────────────────────────────────────────── */}
      <Card>
        <CardBody>
          <h2 className="display text-[16px] text-ink">Full points history</h2>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
            Append-only. A correction appears as its own row beside the original
            rather than replacing it.
          </p>

          {data.ledger.length === 0 ? (
            <EmptyState title="No points yet" />
          ) : (
            <ul className="mt-3 divide-y-[3px] divide-ink">
              {data.ledger.map((entry) => (
                <li key={entry.id} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-extrabold text-ink">
                      {entry.note ?? LEDGER_LABEL[entry.reason] ?? entry.reason}
                    </p>
                    <p className="text-[12px] font-semibold text-ink-soft">
                      {LEDGER_LABEL[entry.reason] ?? entry.reason} ·{" "}
                      {formatDate(entry.created_at, true)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "tabular brut-sm shrink-0 rounded-full px-2.5 py-1 text-[13px] font-extrabold text-ink",
                      entry.delta < 0 ? "bg-bad-tint" : "bg-ok-tint",
                    )}
                  >
                    {formatDelta(entry.delta)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Mini({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "brut-sm rounded-xs py-2",
        highlight ? "bg-poll-tint" : "bg-surface",
      )}
    >
      <p className="tabular display text-[17px] text-ink">{value}</p>
      <p className="text-[10.5px] font-extrabold tracking-wide text-ink/70 uppercase">
        {label}
      </p>
    </div>
  );
}
