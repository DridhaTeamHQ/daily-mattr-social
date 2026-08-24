"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { RatingScaleFields } from "@/components/rating-scale-fields";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Note } from "@/components/ui/feedback";
import { updateSurveyQuestions } from "@/lib/admin/edit-actions";
import { ratingLabelSlots } from "@/lib/question-types";

export type RatingQuestion = {
  id: string;
  /** Its position in the survey, so the heading matches the preview above. */
  number: number;
  prompt: string;
  help_text: string | null;
  options: string[];
};

/**
 * The wording of every rating scale in the survey, editable beside the preview.
 *
 * It sits under the ambassador view because that is where you notice the
 * problem: you read "3 — Good" as a respondent would and decide it should say
 * "Okay". Sending the admin to another screen to change one word, then back
 * here to check it, is three navigations for a five-letter edit.
 *
 * Only the labels. Prompts, types and choices stay on the questions editor —
 * this is the thing the page next to it is showing.
 */
export function RatingScaleEditor({
  surveyId,
  questions,
  answered,
}: {
  surveyId: string;
  questions: RatingQuestion[];
  /** True once the survey has responses. The scale is frozen from then on. */
  answered: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  // Seeded through ratingLabelSlots, so a question saved before labels existed
  // opens with the defaults in the boxes rather than five empty ones.
  const [drafts, setDrafts] = React.useState(() =>
    questions.map((q) => ({ ...q, options: ratingLabelSlots(q.options) })),
  );

  if (questions.length === 0) return null;

  function save() {
    startTransition(async () => {
      const result = await updateSurveyQuestions(
        surveyId,
        drafts.map((d) => ({
          id: d.id,
          // Unchanged, but the action takes a whole question: sending the
          // labels alone would blank the prompt it was written with.
          prompt: d.prompt,
          help_text: d.help_text ?? "",
          type: "rating" as const,
          options: d.options,
        })),
      );

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success("Scale updated.");
      // The preview above is a server render of these same rows.
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="display text-[16px] text-ink">Rating scales</h2>
          <p className="mt-1 text-[13px] text-ink-soft">
            What each number means. Saving updates the preview above — it is
            the same wording respondents see under the number.
          </p>
        </div>

        {answered && (
          <Note tone="warn">
            This survey has answers, so the scale is locked. Renaming what 3
            meant would re-read every 3 already given as something else.
          </Note>
        )}

        {drafts.map((draft) => (
          <div
            key={draft.id}
            className="space-y-3 rounded-xl border border-gray-200 bg-canvas-sunk p-4"
          >
            <p className="text-[13.5px] leading-snug font-bold text-ink">
              <span className="mr-1.5 text-ink-faint">Q{draft.number}</span>
              {draft.prompt}
            </p>

            <RatingScaleFields
              options={draft.options}
              disabled={answered}
              onChange={(labels) =>
                setDrafts((current) =>
                  current.map((d) =>
                    d.id === draft.id ? { ...d, options: labels } : d,
                  ),
                )
              }
            />
          </div>
        ))}

        {!answered && (
          <div className="flex justify-end">
            <Button onClick={save} loading={pending}>
              Save scale
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
