import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clapperboard, ClipboardList, Flame, Gift } from "lucide-react";

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
import { getAmbassadorDetail, requireAdmin } from "@/lib/admin/queries";
import { formatDate, initials } from "@/lib/utils";

export const metadata = { title: "Ambassador" };

const STATUS_TONE = { active: "ok", invited: "warn", suspended: "bad" } as const;

export default async function AmbassadorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const data = await getAmbassadorDetail(id);
  if (!data) notFound();

  const { profile, streak, referrals } = data;
  const name = profile.full_name || profile.email;
  const approved = data.submissions.filter((submission) => submission.status === "approved" || submission.status === "auto_approved").length;

  return (
    <div className="stagger space-y-5">
      <Link href="/admin/ambassadors" className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-ink-soft hover:text-ink"><ArrowLeft className="size-3.5" />Ambassadors</Link>

      <Card className="bg-brand">
        <CardBody className="flex flex-wrap items-center gap-4">
          <span aria-hidden className="brut display grid size-14 shrink-0 place-items-center rounded-full bg-surface text-[16px] text-ink">{initials(name)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="display text-[24px] leading-none text-ink">{profile.full_name || "-"}</h1><Badge tone={STATUS_TONE[profile.status]} dot>{profile.status}</Badge>{streak > 0 && <span className="brut-sm inline-flex items-center gap-1 rounded-full bg-flame-tint px-2.5 py-1 text-[12px] font-extrabold text-ink"><Flame className="size-3.5 text-flame" fill="currentColor" />{streak} day{streak === 1 ? "" : "s"}</span>}</div>
            <p className="mt-1.5 text-[13px] font-semibold text-ink/75">{profile.email}{profile.college ? ` - ${profile.college}` : ""}</p>
            <p className="mt-0.5 text-[12.5px] font-semibold text-ink/60">Joined {formatDate(profile.created_at)}{[profile.city, profile.batch].filter(Boolean).length > 0 ? ` - ${[profile.city, profile.batch].filter(Boolean).join(" - ")}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AmbassadorDetailsDialog profile={{ id: profile.id, full_name: profile.full_name, college: profile.college, city: profile.city, batch: profile.batch, referral_code: profile.referral_code }} />
            <ResetPasswordDialog profileId={profile.id} name={name} />
            {profile.status === "suspended" ? <ActionButton size="sm" variant="secondary" action={setAmbassadorStatus.bind(null, profile.id, "active")}>Reinstate</ActionButton> : <ReasonDialog title={`Suspend ${name}`} description="They keep their login and history but cannot participate. The reason is sent to them and stays on their record." label="Reason" placeholder="Screenshots did not match the campaign" confirmLabel="Suspend" action={setAmbassadorStatus.bind(null, profile.id, "suspended")} trigger={<Button size="sm" variant="secondary">Suspend</Button>} />}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Approved tasks" value={approved} sub={`${data.submissions.length} submitted`} icon={Clapperboard} tone="reel" />
        <Stat label="Survey responses" value={data.surveys.reduce((total, survey) => total + survey.responses, 0)} sub={`${data.surveys.length} link${data.surveys.length === 1 ? "" : "s"} issued`} icon={ClipboardList} tone="poll" />
        <Stat label="Installs" value={referrals.counted} sub={referrals.last ? `Last ${formatDate(referrals.last)}` : "None confirmed"} icon={Gift} tone="invite" />
      </div>

      <Card><CardBody><h2 className="display text-[16px] text-ink">Task submissions</h2>{data.submissions.length === 0 ? <EmptyState icon={Clapperboard} title="Nothing submitted" description="They have not uploaded proof for any campaign task yet." /> : <ul className="mt-3 divide-y divide-gray-100">{data.submissions.map((submission) => <li key={submission.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-extrabold text-ink">{submission.campaign}</p><p className="text-[12px] font-semibold text-ink-soft">{submission.taskLabel} - {formatDate(submission.uploadedAt)}</p></div><StatusBadge status={submission.status} /></li>)}</ul>}</CardBody></Card>

      <Card><CardBody><h2 className="display text-[16px] text-ink">Survey links</h2>{data.surveys.length === 0 ? <EmptyState title="No survey links issued" /> : <ul className="mt-3 divide-y divide-gray-100">{data.surveys.map((survey) => <li key={survey.surveyId} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-[13.5px] font-extrabold text-ink">{survey.title}</p><p className="text-[12px] text-ink-soft">{survey.clicks} clicks - {survey.responses} responses</p></div></li>)}</ul>}</CardBody></Card>
    </div>
  );
}
