"use client";

import * as React from "react";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import {
  updateSurveyQuestions,
  type QuestionEdit,
} from "@/lib/admin/edit-actions";

export type EditableQuestion = {
  id: string;
  type: string;
  prompt: string;
  help_text: string | null;
  options: string[];
};

/**
 * Correcting the wording of a survey that already exists.
 *
 * Closed by default. This sits on a page an admin opens to read answers, and a
 * form full of inputs above the results would invite editing the questions by
 * accident while scrolling past them.
 *
 * Options lock once anybody has answered, because an answer is stored as the
 * option's own text: renaming a choice would leave real answers pointing at
 * wording the survey no longer offers. The server enforces that too — this
 * just stops the fields pretending otherwise.
 */
export function SurveyQuestionsEditor({
  surveyId,
  questions,
  answered,
}: {
  surveyId: string;
  questions: EditableQuestion[];
  /** True once the survey has at least one response. */
  answered: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [drafts, setDrafts] = React.useState<QuestionEdit[]>(() =>
    questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      help_text: q.help_text ?? "",
      options: [...q.options],
    })),
  );

  function update(id: string, patch: Partial<QuestionEdit>) {
    setDrafts((current) =>
      current.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  }

  function setOption(id: string, index: number, value: string) {
    setDrafts((current) =>
      current.map((d) =>
        d.id === id
          ? { ...d, options: d.options.map((o, i) => (i === index ? value : o)) }
          : d,
      ),
    );
  }

  function save() {
    startTransition(async () => {
      const result = await updateSurveyQuestions(surveyId, drafts);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  if (!open) {
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="display text-[16px] text-ink">Questions</h2>
            <p className="mt-1 text-[13px] text-ink-soft">
              {questions.length} question{questions.length === 1 ? "" : "s"}.{" "}
              {answered
                ? "Wording can be corrected; the choices are fixed now that answers exist."
                : "Nobody has answered yet, so anything here can still change."}
            </p>
          </div>

          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            onClick={() => setOpen(true)}
          >
            <Pencil aria-hidden />
            Edit questions
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-[16px] text-ink">Edit questions</h2>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            <X aria-hidden />
            Close
          </Button>
        </div>

        {answered && (
          <Note tone="warn">
            This survey has answers. Prompts and help text can be corrected, but
            the choices are locked — an answer is stored as the option&apos;s own
            words, so renaming one would leave real answers pointing at a choice
            that no longer exists.
          </Note>
        )}

        {drafts.map((draft, index) => {
          const question = questions.find((q) => q.id === draft.id)!;
          const choice =
            question.type === "single_choice" || question.type === "multi_choice";

          return (
            <div
              key={draft.id}
              className="space-y-3 rounded-xl border border-gray-200 bg-canvas-sunk p-4"
            >
              <Field label={`Question ${index + 1}`} htmlFor={`q-${draft.id}`} required>
                <Textarea
                  id={`q-${draft.id}`}
                  rows={2}
                  value={draft.prompt}
                  onChange={(e) => update(draft.id, { prompt: e.target.value })}
                />
              </Field>

              <Field label="Help text" htmlFor={`h-${draft.id}`}>
                <Input
                  id={`h-${draft.id}`}
                  value={draft.help_text}
                  onChange={(e) => update(draft.id, { help_text: e.target.value })}
                  placeholder="Optional — shown under the question."
                />
              </Field>

              {choice && (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-ink">
                    Choices
                  </p>
                  <div className="space-y-2">
                    {draft.options.map((option, i) => (
                      <Input
                        key={i}
                        value={option}
                        disabled={answered}
                        onChange={(e) => setOption(draft.id, i, e.target.value)}
                      />
                    ))}
                  </div>

                  {!answered && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-2"
                      onClick={() =>
                        update(draft.id, { options: [...draft.options, ""] })
                      }
                    >
                      <Plus aria-hidden />
                      Add a choice
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending}>
            Save changes
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
