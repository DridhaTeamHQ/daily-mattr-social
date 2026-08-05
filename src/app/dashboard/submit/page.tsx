import { redirect } from "next/navigation";
import { CircleCheck, Clock, Inbox, Upload } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ProofForm } from "@/components/proof-form";
import { UploadTask } from "@/components/upload-task";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { getCampaigns } from "@/lib/queries";
import { getUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Submit proof" };

const DONE = new Set(["approved", "auto_approved"]);
const WAITING = new Set(["pending", "needs_review"]);

/**
 * The Submission Centre.
 *
 * Every outstanding task from every live campaign, in one list. The campaigns
 * page is organised around campaigns, which is right for browsing but wrong
 * for the actual job — "what do I still owe" is a question about tasks, and
 * answering it meant opening each campaign in turn to find out.
 *
 * Tasks that are done or waiting are shown greyed rather than removed, so the
 * list does not silently shrink and leave somebody wondering whether their
 * upload registered.
 */
export default async function SubmitPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/dashboard/submit");

  const campaigns = await getCampaigns();

  const rows = campaigns.flatMap((campaign) =>
    campaign.tasks.map((task) => ({ campaign, task })),
  );

  const outstanding = rows.filter(({ task }) => !task.submission_status);
  const waiting = rows.filter(
    ({ task }) => task.submission_status && WAITING.has(task.submission_status),
  );
  const settled = rows.filter(
    ({ task }) => task.submission_status && !WAITING.has(task.submission_status),
  );

  const ordered = [...outstanding, ...waiting, ...settled];

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={Upload}
        tone="reel"
        title="Submit proof"
        description="Everything you still owe, from every live campaign, in one place."
        variant="outline"
        className="border-gray-200 bg-gray-50"
      />

      <div className="grid grid-cols-3 gap-3">
        <Tally label="To do" value={outstanding.length} tone="text-ink" />
        <Tally label="Waiting" value={waiting.length} tone="text-amber-600" />
        <Tally label="Done" value={settled.filter(({ task }) => DONE.has(task.submission_status!)).length} tone="text-emerald-600" />
      </div>

      {ordered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="Nothing to submit"
            description="When a campaign goes live, its tasks appear here."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {ordered.map(({ campaign, task }) => {
            const status = task.submission_status;
            const done = status ? DONE.has(status) : false;
            const pending = status ? WAITING.has(status) : false;
            const rejected = status === "rejected" || status === "revoked";

            return (
              <li key={task.id}>
                <Card className={cn((done || pending) && "opacity-70")}>
                  <CardBody>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-extrabold text-ink">
                        {task.label}
                      </span>
                      {task.platform && (
                        <Badge tone="neutral">{task.platform}</Badge>
                      )}
                      <Badge tone="brand">+{task.points}</Badge>

                      <span className="ml-auto">
                        {done ? (
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-emerald-600">
                            <CircleCheck className="size-3.5" />
                            Approved
                          </span>
                        ) : pending ? (
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-amber-600">
                            <Clock className="size-3.5" />
                            With a reviewer
                          </span>
                        ) : rejected ? (
                          <Badge tone="bad">try again</Badge>
                        ) : null}
                      </span>
                    </div>

                    <p className="mt-1 text-[12.5px] font-semibold text-ink-soft">
                      {campaign.title}
                      {task.instructions ? ` · ${task.instructions}` : ""}
                    </p>

                    {!done && !pending && (
                      <div className="mt-3">
                        {task.proof_type === "screenshot" ? (
                          <UploadTask
                            taskId={task.id}
                            taskLabel={task.label}
                            points={task.points}
                            expectedHandle={campaign.expected_handle}
                          />
                        ) : (
                          <ProofForm
                            taskId={task.id}
                            proofType={task.proof_type}
                            points={task.points}
                          />
                        )}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
      <p className={cn("display text-[26px] leading-none", tone)}>{value}</p>
      <p className="mt-1 text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
        {label}
      </p>
    </div>
  );
}
