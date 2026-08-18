"use client";

import * as React from "react";
import { Pencil, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import {
  updateSurveyQuestions,
  type QuestionEdit,
} from "@/lib/admin/edit-actions";
import { polishSurveyQuestion } from "@/lib/admin/ai-actions";

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
  aiEnabled,
}: {
  surveyId: string;
  questions: EditableQuestion[];
  /** True once the survey has at least one response. */
  answered: boolean;
  /** Hidden entirely without an API key, rather than offering a dead button. */
  aiEnabled: boolean;
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

  function removeOption(id: string, index: number) {
    setDrafts((current) =>
      current.map((d) =>
        d.id === id
          ? { ...d, options: d.options.filter((_, i) => i !== index) }
          : d,
      ),
    );
  }

  // Which question is being rewritten, so only that card shows a spinner.
  const [polishing, setPolishing] = React.useState<string | null>(null);

  function polish(id: string) {
    const draft = drafts.find((d) => d.id === id);
    const question = questions.find((q) => q.id === id);
    if (!draft || !question) return;

    setPolishing(id);
    void polishSurveyQuestion({
      prompt: draft.prompt,
      helpText: draft.help_text,
      options: draft.options,
      type: question.type,
      lockOptions: answered,
    })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        // Straight into the fields, unsaved. The admin reads it, edits it, and
        // presses Save — or closes without saving and nothing happened.
        // Help text is deliberately not applied: the field is not shown, so
        // an AI-written line would reach respondents without anybody having
        // read it. Whatever is stored stays stored.
        update(id, {
          prompt: result.data.prompt,
          ...(answered ? {} : { options: result.data.options }),
        });
        toast.success("Rewritten — check it before saving.");
      })
      .finally(() => setPolishing(null));
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
              <div className="flex items-start justify-between gap-3">
                <Field
                  className="min-w-0 flex-1"
                  label={`Question ${index + 1}`}
                  htmlFor={`q-${draft.id}`}
                  required
                >
                  <Textarea
                    id={`q-${draft.id}`}
                    rows={2}
                    value={draft.prompt}
                    onChange={(e) => update(draft.id, { prompt: e.target.value })}
                  />
                </Field>

                {/* Per question, not per survey: an admin fixing one awkward
                    sentence should not have the other four rewritten under
                    them. */}
                {aiEnabled && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-6 shrink-0"
                    loading={polishing === draft.id}
                    disabled={polishing !== null || !draft.prompt.trim()}
                    onClick={() => polish(draft.id)}
                    title="Rewrite this question with AI — you review it before saving"
                  >
                    <Sparkles aria-hidden />
                    Rewrite
                  </Button>
                )}
              </div>

              {choice && (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-ink">
                    Choices
                  </p>
                  <div className="space-y-2">
                    {draft.options.map((option, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          className="min-w-0 flex-1"
                          value={option}
                          disabled={answered}
                          onChange={(e) => setOption(draft.id, i, e.target.value)}
                        />

                        {/* Two is the floor: a choice question with one option
                            is not a question, and the database refuses it. The
                            button disappears rather than failing on save. */}
                        {!answered && draft.options.length > 2 && (
                          <button
                            type="button"
                            aria-label={`Remove choice ${i + 1}`}
                            onClick={() => removeOption(draft.id, i)}
                            className="tap grid size-9 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white text-ink-soft transition-colors hover:bg-bad-tint hover:text-bad"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>
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
