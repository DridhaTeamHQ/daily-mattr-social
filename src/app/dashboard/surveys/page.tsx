import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SurveyLinkCard } from "@/components/survey-link-card";
import { Card } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { getDashboard } from "@/lib/queries";
import { getSetting } from "@/lib/settings";
import { getSiteUrl } from "@/lib/site-url";

export const metadata = { title: "Surveys" };

export default async function SurveysPage() {
  const data = await getDashboard();
  if (!data) redirect("/login");

  const { surveys } = data;
  // The programme's own threshold, not a number invented here — it is the
  // same one the stipend rules are published with.
  const [siteUrl, target] = await Promise.all([
    getSiteUrl(),
    getSetting("stipend_min_responses_per_survey"),
  ]);

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

      {surveys.map((survey) => (
        <SurveyLinkCard
          key={survey.survey_id}
          survey={survey}
          siteUrl={siteUrl}
          target={target}
        />
      ))}
    </div>
  );
}
