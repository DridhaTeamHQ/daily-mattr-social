import { redirect } from "next/navigation";
import { ClipboardList, ExternalLink, Flag, Link as LinkIcon, MessageSquare, Pointer } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { SurveyCard } from "@/components/survey-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { getDashboard } from "@/lib/queries";
import { getSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export const metadata = { title: "Surveys" };

export default async function SurveysPage() {
  const data = await getDashboard();
  if (!data) redirect("/login");

  const { surveys } = data;
  const siteUrl = await getSiteUrl();

  if (surveys.length === 0) {
    return (
      <Card>
        <EmptyState icon={ClipboardList} title="No surveys yet" description="When the team publishes a survey, you'll get your own link to share." />
      </Card>
    );
  }

  return (
    <div className="stagger space-y-4">
      <PageHeader
        icon={ClipboardList}
        tone="poll"
        title="Surveys"
        description="Share your survey and collect genuine responses."
        variant="outline"
      />

      <Note tone="neutral" size="sm">
        Each link below is yours alone. Duplicate submissions from the same person do not count twice.
      </Note>

      {surveys.map((survey) => {
        const url = `${siteUrl}/s/${survey.slug}`;
        return (
          <SurveyCard
            key={survey.survey_id}
            id={survey.survey_id}
            title={survey.survey_title}
            clicks={survey.click_count}
            responses={survey.valid_responses}
          >
            <div className="px-6 pt-0 pb-6">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Metric label="Clicks" value={survey.click_count} tone="clicks" />
                <Metric label="Responses" value={survey.valid_responses} tone="responses" />
              </dl>

              {survey.flagged > 0 && (
                <p className="mt-4 flex items-center gap-2 text-[13px] font-medium text-ink-soft">
                  <Flag className="size-4 text-red-500" />
                  <span>
                    <strong className="font-semibold text-ink">{survey.flagged} {survey.flagged === 1 ? "response" : "responses"} flagged for review</strong>. These do not count until cleared.
                  </span>
                </p>
              )}

              <div className="mt-4 flex flex-1 items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <LinkIcon className="size-4 shrink-0 text-ink-soft" />
                <code className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-ink">{url}</code>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <CopyButton value={url} size="md" variant="primary" className="border-0 bg-brand-strong text-white shadow-sm hover:bg-brand-press" label="Copy link" copiedLabel="Link copied" toastMessage="Survey link copied" />
                <Button size="md" variant="secondary" className="border border-gray-200 bg-white text-ink shadow-sm" asChild>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    Preview
                    <ExternalLink aria-hidden />
                  </a>
                </Button>
              </div>
            </div>
          </SurveyCard>
        );
      })}
    </div>
  );
}

function Metric({ label, value, tone = "clicks" }: { label: string; value: number; tone?: "clicks" | "responses" }) {
  const background = tone === "clicks" ? "bg-gray-100" : "bg-brand-tint";
  const iconBackground = tone === "clicks" ? "bg-gray-800" : "bg-brand-strong";
  const Icon = tone === "clicks" ? Pointer : MessageSquare;

  return (
    <div className={cn("flex items-center gap-4 rounded-xl px-6 py-5", background)}>
      <div className={cn("grid size-12 shrink-0 place-items-center rounded-full text-white", iconBackground)}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <dd className="text-[28px] font-extrabold leading-none text-ink">{value}</dd>
        <dt className="mt-1 text-[12px] font-bold uppercase tracking-wide text-ink">{label}</dt>
      </div>
    </div>
  );
}
