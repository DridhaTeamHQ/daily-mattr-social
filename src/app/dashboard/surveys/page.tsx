import { redirect } from "next/navigation";
import { ClipboardList, ExternalLink } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { publicEnv } from "@/lib/env";
import { getDashboard } from "@/lib/queries";

export const metadata = { title: "Surveys" };

export default async function SurveysPage() {
  const data = await getDashboard();
  if (!data) redirect("/login");

  const { surveys } = data;

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
        const url = `${publicEnv.siteUrl}/s/${s.slug}`;

        return (
          <Card key={s.survey_id}>
            <CardBody>
              <h2 className="text-[15px] font-semibold text-ink">
                {s.survey_title}
              </h2>

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

              <div className="mt-4 flex items-center gap-2 rounded-sm border border-line bg-canvas-sunk px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-soft">
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
