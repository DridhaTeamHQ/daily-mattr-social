import {
  CheckCircle2,
  ExternalLink,
  Flag,
  Link as LinkIcon,
  MessageSquare,
} from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { SurveyCard } from "@/components/survey-card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/stat";
import type { SurveyStat } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * One survey as a student sees it: their own link, how close it is to done,
 * and the buttons that move it along.
 *
 * Extracted because this appears in two places — the Surveys page and inside
 * Tasks. Two copies of a card showing the same numbers is how the two drift
 * into disagreeing about what "responses" means.
 *
 * Clicks are deliberately not shown. They counted people who opened the link
 * and left, which is not work anybody is credited for, and having two numbers
 * side by side invited reading the bigger one as progress.
 */
export function SurveyLinkCard({
  survey,
  siteUrl,
  target,
}: {
  survey: SurveyStat;
  siteUrl: string;
  /** Responses that finish this survey. */
  target: number;
}) {
  const url = `${siteUrl}/s/${survey.slug}`;
  const done = survey.valid_responses >= target;
  const remaining = Math.max(0, target - survey.valid_responses);

  return (
    <SurveyCard
      id={survey.survey_id}
      title={survey.survey_title}
      responses={survey.valid_responses}
      target={target}
    >
      <div className="px-6 pt-0 pb-6">
        <div
          className={cn(
            "rounded-xl px-6 py-5",
            done ? "bg-ok-tint" : "bg-brand-tint",
          )}
        >
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-full text-white",
                done ? "bg-ok" : "bg-brand-strong",
              )}
            >
              {done ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <MessageSquare className="size-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[28px] leading-none font-extrabold text-ink">
                {survey.valid_responses}
                <span className="text-[18px] text-ink-soft">/{target}</span>
              </p>
              <p className="mt-1 text-[12px] font-bold tracking-wide text-ink uppercase">
                Responses
              </p>
            </div>
          </div>

          <ProgressBar
            value={survey.valid_responses}
            max={target}
            tone={done ? "ok" : "brand"}
            className="mt-4"
          />

          <p className="mt-2 text-[12.5px] font-semibold text-ink-soft">
            {done
              ? "Complete — this survey is done."
              : `${remaining} more ${remaining === 1 ? "response" : "responses"} to complete this survey.`}
          </p>
        </div>

        {survey.flagged > 0 && (
          <p className="mt-4 flex items-center gap-2 text-[13px] font-medium text-ink-soft">
            <Flag className="size-4 text-red-500" />
            <span>
              <strong className="font-semibold text-ink">
                {survey.flagged}{" "}
                {survey.flagged === 1 ? "response" : "responses"} flagged for
                review
              </strong>
              . These do not count until cleared.
            </span>
          </p>
        )}

        <div className="mt-4 flex flex-1 items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <LinkIcon className="size-4 shrink-0 text-ink-soft" />
          <code className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-ink">
            {url}
          </code>
        </div>

        {/* Participate first, because filling the survey in is the thing that
            moves the count. Copy is last: it is what you reach for once you
            have decided to send it to somebody else. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            size="md"
            className="border-0 bg-brand-strong text-white shadow-sm hover:bg-brand-press"
            asChild
          >
            <a href={url} target="_blank" rel="noopener noreferrer">
              Participate now
              <ExternalLink aria-hidden />
            </a>
          </Button>
          <CopyButton
            value={url}
            size="md"
            variant="secondary"
            className="border border-gray-200 bg-white text-ink shadow-sm"
            label="Copy link"
            copiedLabel="Link copied"
            toastMessage="Survey link copied"
          />
        </div>
      </div>
    </SurveyCard>
  );
}
