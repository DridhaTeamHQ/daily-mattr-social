import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { type PublicQuestion } from "@/app/s/[slug]/survey-form";
import { SurveyView } from "@/app/s/[slug]/survey-view";
import { Note } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/admin/queries";
import { createCachedClient as createClient } from "@/lib/admin/cached-client";

export const metadata = { title: "Ambassador view" };

/**
 * The survey exactly as an ambassador's link renders it.
 *
 * Draft surveys have no links yet, so the only way to see what you are about
 * to publish used to be to publish it and open your own link. This renders the
 * real page component with the real questions — the only differences are that
 * nothing submits and there is no click to count.
 */
export default async function SurveyPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const supabase = await createClient();

  const { data: survey, error } = await supabase
    .from("surveys")
    .select(
      "id, title, description, status, require_email, require_phone, audience",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[surveyPreview] reading survey ${id} failed: ${error.message}`,
    );
  }
  if (!survey) notFound();

  const [{ data: questions }, { data: link }] = await Promise.all([
    supabase
      .from("survey_questions")
      .select("id, type, prompt, help_text, options, required, max_select")
      .eq("survey_id", id)
      .order("order_index", { ascending: true }),
    // A real name in the "Shared by" sticker where one exists, so the preview
    // shows it at its real width rather than a placeholder's.
    supabase
      .from("survey_links")
      .select("profiles(full_name)")
      .eq("survey_id", id)
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="stagger space-y-5">
      <div>
        <Link
          href="/admin/surveys"
          className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Surveys
        </Link>

        <h1 className="display mt-2 text-[26px] leading-none text-ink">
          Ambassador view
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          {survey.title} — what opens when someone taps an ambassador&apos;s
          link.
        </p>
      </div>

      {/* The preview shows the survey as live even when it is a draft.
          Rendering the "this survey has closed" card for a draft would preview
          the wrong page: what you want to check before publishing is the page
          publishing will produce. */}
      {survey.status !== "live" && (
        <Note tone="warn">
          This survey is {survey.status}, so nobody can open it yet. The preview
          shows it as it will look once it is live.
        </Note>
      )}

      {/* Boxed, because the real page owns the whole screen and this one is a
          panel inside the admin shell. The border is the edge of the phone. */}
      <div className="overflow-hidden rounded-sm border-[3px] border-ink">
        <SurveyView
          preview
          title={survey.title}
          description={survey.description}
          ambassadorName={link?.profiles?.full_name ?? "your ambassador"}
          closed={false}
          requireEmail={survey.require_email}
          requirePhone={survey.require_phone}
          askWhoYouAre={survey.audience !== "participant"}
          questions={((questions ?? []) as PublicQuestion[]).map((q) => ({
            ...q,
            options: Array.isArray(q.options) ? (q.options as string[]) : [],
          }))}
        />
      </div>
    </div>
  );
}
