import { notFound } from "next/navigation";

import { SurveyForm, type PublicQuestion } from "./survey-form";
import { Card, CardBody } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The public survey page.
 *
 * Reached by a stranger through an ambassador's personal link, with no account
 * and no session. Every read uses the service-role client because `anon` has no
 * SELECT policy on `survey_links` — a masked slug is the only credential, and
 * exposing the table would let anyone enumerate every ambassador's links.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function loadSurvey(slug: string) {
  const db = createAdminClient();

  const { data: link } = await db
    .from("survey_links")
    .select("id, survey_id, click_count, surveys(id, title, description, status, points_per_response, require_email, require_phone), profiles(full_name, college)")
    .eq("slug", slug)
    .maybeSingle();

  if (!link?.surveys) return null;

  const { data: questions } = await db
    .from("survey_questions")
    .select("id, type, prompt, help_text, options, required")
    .eq("survey_id", link.surveys.id)
    .order("order_index", { ascending: true });

  return { link, survey: link.surveys, ambassador: link.profiles, questions };
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const loaded = await loadSurvey(slug);

  return {
    title: loaded?.survey.title ?? "Survey",
    description: loaded?.survey.description ?? undefined,
    // These links get pasted into WhatsApp and Instagram bios; letting a search
    // engine index a per-ambassador URL helps nobody.
    robots: { index: false, follow: false },
  };
}

export default async function PublicSurveyPage({ params }: Params) {
  const { slug } = await params;
  const loaded = await loadSurvey(slug);

  if (!loaded) notFound();

  const { link, survey, ambassador, questions } = loaded;

  // Count the visit. Fire-and-forget: a failed counter must never stop someone
  // answering, and an exact count is not worth a round trip on the happy path.
  createAdminClient()
    .from("survey_links")
    .update({ click_count: link.click_count + 1 })
    .eq("id", link.id)
    .then(() => {});

  const closed = survey.status !== "live";

  return (
    <div className="min-h-dvh bg-canvas">
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <header className="border-b-[3px] border-ink bg-brand px-5 py-9 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-2xl">
          <p className="display text-[15px] text-ink">DailyMattr</p>
          <h1 className="display mt-3 text-[32px] leading-[0.95] text-ink sm:text-[44px]">
            {survey.title}
          </h1>
          {survey.description && (
            <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed font-semibold text-ink/80">
              {survey.description}
            </p>
          )}
          {ambassador?.full_name && (
            <p className="sticker mt-5 inline-block rounded-full bg-surface px-3.5 py-1.5 text-[12.5px] font-extrabold text-ink">
              Shared by {ambassador.full_name}
              {ambassador.college ? ` · ${ambassador.college}` : ""}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        {closed ? (
          <Card>
            <CardBody className="py-12 text-center">
              <h2 className="display text-[22px] text-ink">
                This survey has closed
              </h2>
              <p className="mt-2 text-[13.5px] text-ink-soft">
                Thanks for stopping by — there&apos;s nothing to fill in here
                any more.
              </p>
            </CardBody>
          </Card>
        ) : questions?.length ? (
          <SurveyForm
            slug={slug}
            requireEmail={survey.require_email}
            requirePhone={survey.require_phone}
            questions={(questions as PublicQuestion[]).map((q) => ({
              ...q,
              options: Array.isArray(q.options) ? (q.options as string[]) : [],
            }))}
          />
        ) : (
          <Card>
            <CardBody className="py-12 text-center">
              <h2 className="display text-[22px] text-ink">
                Nothing to answer yet
              </h2>
              <p className="mt-2 text-[13.5px] text-ink-soft">
                This survey doesn&apos;t have any questions on it.
              </p>
            </CardBody>
          </Card>
        )}
      </main>
    </div>
  );
}
