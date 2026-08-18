import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { after } from "next/server";

import { SurveyForm, type PublicQuestion } from "./survey-form";
import { Card, CardBody } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { countSurveyClick } from "@/lib/click-counter";

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

/**
 * Cached for a minute, because this is the page a crowd lands on.
 *
 * A link shared to a lecture hall is 200 people opening the same URL inside a
 * minute, and every one of them was costing two round trips to fetch a survey
 * that had not changed since the last one. Under load that read the questions
 * hundreds of times and answered nobody quickly: 50 concurrent visitors got
 * 16 requests a second and a 6.7-second worst case.
 *
 * The cost is that an edit takes up to a minute to appear, including closing
 * a survey. Sixty seconds of a closed survey still accepting answers is worth
 * the page staying up; the submit action re-checks status against the database
 * anyway, so a late answer is refused there rather than silently kept.
 */
const loadSurvey = unstable_cache(
  async (slug: string) => {
    const db = createAdminClient();

    const { data: link } = await db
      .from("survey_links")
      .select("id, survey_id, surveys(id, title, description, status, points_per_response, require_email, require_phone, audience), profiles(full_name)")
      .eq("slug", slug)
      .maybeSingle();

    if (!link?.surveys) return null;

    const { data: questions } = await db
      .from("survey_questions")
      .select("id, type, prompt, help_text, options, required, max_select")
      .eq("survey_id", link.surveys.id)
      .order("order_index", { ascending: true });

    return { link, survey: link.surveys, ambassador: link.profiles, questions };
  },
  ["public-survey"],
  { revalidate: 60, tags: ["public-survey"] },
);

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

  // Count the visit in the database, after the page has gone out.
  //
  // Two things were wrong. It used to read click_count and write back
  // value + 1, which loses every click that arrives while another is in
  // flight — 137 concurrent views recorded 9. And it sat in the render path,
  // so every visitor waited on a round trip to record something they do not
  // care about.
  //
  // `bump_survey_click` adds in one statement, so simultaneous visitors queue
  // on the row instead of overwriting each other; countSurveyClick coalesces
  // a burst into a handful of writes; and `after` runs the whole thing once
  // the response is already on its way out.
  after(() => countSurveyClick(link.id));

  const closed = survey.status !== "live";

  return (
    <div className="min-h-dvh bg-canvas">
      {/* ─── Header ────────────────────────────────────────────────────── */}
      {/* No scrolling bands here.
          The doodle strip and the tape masthead both moved on their own, which
          is fine on a page somebody chose to visit and wrong on this one: a
          stranger arrives from a link with one thing to do, and two animations
          above the question compete with it. The header is the survey's own
          title now. */}
      <header className="border-b-[3px] border-ink bg-brand">
        <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
          <h1 className="display text-[32px] leading-[0.95] text-white sm:text-[44px]">
            {survey.title}
          </h1>

          {/* Full white, not a faded one: at 14.5px this is body text on a
              mid-blue, and every step of transparency comes straight off the
              contrast ratio. */}
          {survey.description && (
            <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed font-semibold text-white">
              {survey.description}
            </p>
          )}

          {/* The name, and nothing else. The college used to sit beside it,
              which told a stranger where the person sharing the link studies
              — someone else's affiliation, published to everyone who opens
              the link, for no benefit to the survey. */}
          {ambassador?.full_name && (
            <p className="sticker sticker-r mt-5 inline-block rounded-full bg-surface px-3.5 py-1.5 text-[12.5px] font-extrabold text-ink">
              Shared by {ambassador.full_name}
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
            askWhoYouAre={survey.audience !== "participant"}
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
