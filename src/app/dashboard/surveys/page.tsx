import { redirect } from "next/navigation";
import { ClipboardList, ExternalLink } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { getSiteUrl } from "@/lib/site-url";
import { getDashboard } from "@/lib/queries";

export const metadata = { title: "Surveys" };

export default async function SurveysPage() {
  const data = await getDashboard();
  if (!data) redirect("/login");

  const { surveys } = data;

  // Derived from the request host, so a student always copies a link that
  // works from wherever they actually opened the app.
  const siteUrl = await getSiteUrl();

  if (surveys.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="No surveys yet"
          description="When the team publishes a survey you'll get your own link to share, and points for every genuine response."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ClipboardList}
        tone="poll"
        title="Surveys"
        description="Share your link. Every genuine response earns you points."
      />

      <Note tone="neutral">
        Each link below is yours alone — responses collected through it are
        credited to you. Duplicate submissions from the same person don&apos;t
        count twice.
      </Note>

      {surveys.map((s) => {
        const url = `${siteUrl}/s/${s.slug}`;

        return (
          <Card key={s.survey_id}>
            <CardBody>
              <h2 className="display text-[19px] text-ink">{s.survey_title}</h2>

              <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                <Metric label="Clicks" value={s.click_count} />
                <Metric label="Responses" value={s.valid_responses} />
                <Metric label="Points" value={s.points_earned} tone="poll" />
              </dl>

              {s.flagged > 0 && (
                <p className="mt-3 text-[12.5px] text-warn">
                  {s.flagged} {s.flagged === 1 ? "response" : "responses"}{" "}
                  flagged for review — these don&apos;t earn points until
                  cleared.
                </p>
              )}

              <div className="brut-sm mt-4 flex items-center gap-2 rounded-sm bg-canvas-sunk px-3 py-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-bold text-ink">
                  {url}
                </code>
              </div>
            </CardBody>

            <CardFooter className="flex flex-wrap items-center gap-2">
              <CopyButton
                value={url}
                size="sm"
                variant="primary"
                label="Copy link"
                copiedLabel="Link copied"
                toastMessage="Survey link copied"
              />
              <Button size="sm" variant="secondary" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Preview
                  <ExternalLink aria-hidden />
                </a>
              </Button>
              {s.click_count === 0 && (
                <Badge tone="neutral" className="ml-auto">
                  Not shared yet
                </Badge>
              )}
            </CardFooter>
          </Card>
        );
      })}
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
    <div
      className={`brut-sm rounded-sm py-3 ${
        tone === "poll" ? "bg-poll-tint" : "bg-canvas-sunk"
      }`}
    >
      <dd className="tabular display text-[24px] text-ink">{value}</dd>
      <dt className="mt-0.5 text-[11.5px] font-extrabold tracking-wide text-ink/70 uppercase">
        {label}
      </dt>
    </div>
  );
}
