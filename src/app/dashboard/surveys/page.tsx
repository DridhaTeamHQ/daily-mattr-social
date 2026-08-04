import { redirect } from "next/navigation";
import { ClipboardList, ExternalLink, Flag, Link as LinkIcon, Pointer, MessageSquare, Star } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { getSiteUrl } from "@/lib/site-url";
import { getDashboard } from "@/lib/queries";
import { cn } from "@/lib/utils";

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
    <div className="stagger space-y-4">
      <PageHeader
        icon={ClipboardList}
        tone="poll"
        title="Surveys"
        description="Share your link. Every genuine response earns you points."
        variant="outline"
        action={
          <div className="relative size-16 shrink-0 md:size-20 bg-blue-50 rounded-xl hidden sm:block">
            {/* Simple CSS clipboard illustration to match the space */}
            <div className="absolute inset-2 bg-white rounded-md border-2 border-blue-200 shadow-sm" />
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-6 h-3 bg-gray-200 rounded-sm border-2 border-blue-200" />
            <div className="absolute top-6 left-4 w-6 h-1.5 bg-blue-100 rounded-full" />
            <div className="absolute top-9 left-4 w-4 h-1.5 bg-blue-100 rounded-full" />
            <div className="absolute top-12 left-4 w-8 h-1.5 bg-blue-100 rounded-full" />
          </div>
        }
      />

      <Note tone="neutral">
        Each link below is yours alone — responses collected through it are
        credited to you. Duplicate submissions from the same person don&apos;t
        count twice.
      </Note>

      {surveys.map((s) => {
        const url = `${siteUrl}/s/${s.slug}`;

        return (
          <Card key={s.survey_id} className="p-6">
            <h2 className="text-[16px] font-extrabold uppercase tracking-wide text-ink">{s.survey_title}</h2>

            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Metric label="Clicks" value={s.click_count} tone="clicks" />
              <Metric label="Responses" value={s.valid_responses} tone="responses" />
              <Metric label="Points" value={s.points_earned} tone="points" />
            </dl>

            {s.flagged > 0 && (
              <p className="mt-4 text-[13px] font-medium text-ink-soft flex items-center gap-2">
                <Flag className="size-4 text-red-500" />
                <span>
                  <strong className="text-ink font-semibold">{s.flagged} {s.flagged === 1 ? "response" : "responses"} flagged for review</strong> — these don&apos;t earn points until cleared.
                </span>
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <div className="flex flex-1 items-center gap-3 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                <LinkIcon className="size-4 text-ink-soft shrink-0" />
                <code className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-ink">
                  {url}
                </code>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <CopyButton
                value={url}
                size="md"
                variant="primary"
                className="bg-blue-600 text-white hover:bg-blue-700 border-0 shadow-sm"
                label="Copy link"
                copiedLabel="Link copied"
                toastMessage="Survey link copied"
              />
              <Button size="md" variant="secondary" className="bg-white border border-gray-200 text-ink shadow-sm" asChild>
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
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "clicks",
}: {
  label: string;
  value: number;
  tone?: "clicks" | "responses" | "points";
}) {
  const METRIC_BG = {
    clicks: "bg-gray-100",
    responses: "bg-blue-50",
    points: "bg-gray-100",
  };
  const METRIC_ICON_BG = {
    clicks: "bg-gray-800",
    responses: "bg-blue-600",
    points: "bg-black",
  };
  const Icon = tone === "clicks" ? Pointer : tone === "responses" ? MessageSquare : Star;

  return (
    <div className={cn("flex items-center gap-4 rounded-xl px-6 py-5", METRIC_BG[tone])}>
       <div className={cn("grid size-12 shrink-0 place-items-center rounded-full text-white", METRIC_ICON_BG[tone])}>
         <Icon className="size-5" />
       </div>
       <div className="text-left flex-1 min-w-0">
         <dd className="text-[28px] font-extrabold text-ink leading-none">{value}</dd>
         <dt className="mt-1 text-[12px] font-bold tracking-wide text-ink uppercase">{label}</dt>
       </div>
    </div>
  );
}
