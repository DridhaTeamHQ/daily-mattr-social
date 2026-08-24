import { SurveyForm, type PublicQuestion } from "./survey-form";
import { Card, CardBody } from "@/components/ui/card";

/**
 * Everything an ambassador's link puts on screen.
 *
 * Split out of the page so the admin preview shows the page itself rather than
 * a second copy of it that drifts. The page keeps the parts a preview must not
 * have — the slug lookup, the click count, the cache — and this keeps the
 * markup.
 */
export function SurveyView({
  title,
  description,
  ambassadorName,
  closed,
  questions,
  requireEmail,
  requirePhone,
  askWhoYouAre,
  slug,
  preview = false,
}: {
  title: string;
  description: string | null;
  ambassadorName: string | null;
  closed: boolean;
  questions: PublicQuestion[];
  requireEmail: boolean;
  requirePhone: boolean;
  askWhoYouAre: boolean;
  /** Absent in a preview — there is no link to submit against. */
  slug?: string;
  preview?: boolean;
}) {
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
            {title}
          </h1>

          {/* Full white, not a faded one: at 14.5px this is body text on a
              mid-blue, and every step of transparency comes straight off the
              contrast ratio. */}
          {description && (
            <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed font-semibold text-white">
              {description}
            </p>
          )}

          {/* The name, and nothing else. The college used to sit beside it,
              which told a stranger where the person sharing the link studies
              — someone else's affiliation, published to everyone who opens
              the link, for no benefit to the survey. */}
          {ambassadorName && (
            <p className="sticker sticker-r mt-5 inline-block rounded-full bg-surface px-3.5 py-1.5 text-[12.5px] font-extrabold text-ink">
              Shared by {ambassadorName}
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
        ) : questions.length ? (
          <SurveyForm
            slug={slug ?? ""}
            preview={preview}
            requireEmail={requireEmail}
            requirePhone={requirePhone}
            askWhoYouAre={askWhoYouAre}
            questions={questions}
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
