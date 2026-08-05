import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { SurveyEditDialog } from "@/components/edit-dialogs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { issueSurveyLinks, setSurveyStatus } from "@/lib/admin/actions";
import { getAdminSurveys } from "@/lib/admin/queries";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Surveys" };

const STATUS_TONE = { live: "ok", draft: "neutral", closed: "neutral" } as const;

export default async function AdminSurveysPage() {
  const surveys = await getAdminSurveys();

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[26px] leading-none text-ink">
            Surveys
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Publishing a survey issues a personal link to every active
            ambassador.
          </p>
        </div>

        <Button asChild>
          <Link href="/admin/surveys/new">New survey</Link>
        </Button>
      </div>

      {surveys.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No surveys yet"
            description="Build one with your own questions, then publish it to send links out."
          />
        </Card>
      ) : (
        <ul className="space-y-4">
          {surveys.map((s) => (
            <li key={s.id}>
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-ink">
                      {s.title}
                    </h2>
                    <Badge tone={STATUS_TONE[s.status]} dot>
                      {s.status}
                    </Badge>
                    <Badge tone="poll">+{s.points_per_response} per response</Badge>
                  </div>

                  {s.description && (
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                      {s.description}
                    </p>
                  )}

                  <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <Metric label="Questions" value={s.questionCount} />
                    <Metric label="Links issued" value={s.linkCount} />
                    <Metric label="Responses" value={s.responseCount} tone="poll" />
                  </dl>

                  <p className="mt-3 text-[12px] text-ink-faint">
                    Created {formatDate(s.created_at)}
                    {s.require_email && " · email required"}
                    {s.require_phone && " · phone required"}
                  </p>

                  {s.status === "live" && s.linkCount === 0 && (
                    <Note tone="warn" className="mt-3">
                      This survey is live but nobody has a link. Issue links
                      below, or ambassadors won&apos;t see it.
                    </Note>
                  )}
                </CardBody>

                <CardFooter className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/admin/surveys/${s.id}/responses`}>
                      Read {s.responseCount > 0 ? `${s.responseCount} ` : ""}
                      response{s.responseCount === 1 ? "" : "s"}
                    </Link>
                  </Button>

                  <SurveyEditDialog survey={s} responseCount={s.responseCount} />

                  {s.status === "draft" && (
                    <ActionButton
                      size="sm"
                      action={setSurveyStatus.bind(null, s.id, "live")}
                      confirmMessage={`Publish "${s.title}"? Every active ambassador gets their own link.`}
                    >
                      Publish
                    </ActionButton>
                  )}

                  {s.status === "live" && (
                    <>
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        action={issueSurveyLinks.bind(null, s.id)}
                      >
                        Issue missing links
                      </ActionButton>
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        action={setSurveyStatus.bind(null, s.id, "closed")}
                        confirmMessage={`Close "${s.title}"? Existing links stop accepting responses.`}
                      >
                        Close
                      </ActionButton>
                    </>
                  )}

                  {s.status === "closed" && (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      action={setSurveyStatus.bind(null, s.id, "live")}
                    >
                      Re-open
                    </ActionButton>
                  )}
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "poll";
}) {
  return (
    <div className="rounded-sm bg-canvas-sunk py-3">
      <dd
        className={`tabular text-[20px] font-semibold ${
          tone === "poll" ? "text-poll" : "text-ink"
        }`}
      >
        {value}
      </dd>
      <dt className="mt-0.5 text-[12px] text-ink-soft">{label}</dt>
    </div>
  );
}
