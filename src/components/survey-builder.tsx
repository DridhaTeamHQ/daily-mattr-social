"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import { createSurvey, type SurveyQuestionInput } from "@/lib/admin/actions";
import type { Enums } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const TYPES: {
  value: Enums<"question_type">;
  label: string;
  hint: string;
  hasOptions?: boolean;
}[] = [
  { value: "short_text", label: "Short text", hint: "One line" },
  { value: "long_text", label: "Paragraph", hint: "A few sentences" },
  { value: "single_choice", label: "Pick one", hint: "Radio buttons", hasOptions: true },
  { value: "multi_choice", label: "Pick many", hint: "Checkboxes", hasOptions: true },
  { value: "rating", label: "Rating", hint: "1 to 5" },
  { value: "number", label: "Number", hint: "Digits only" },
  { value: "email", label: "Email", hint: "Validated" },
  { value: "phone", label: "Phone", hint: "Validated" },
];

type Draft = SurveyQuestionInput & { key: string };

let nextKey = 0;
const newQuestion = (): Draft => ({
  key: `q${nextKey++}`,
  type: "short_text",
  prompt: "",
  help_text: "",
  options: [],
  required: true,
});

export function SurveyBuilder() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [points, setPoints] = React.useState("10");
  const [requireEmail, setRequireEmail] = React.useState(true);
  const [requirePhone, setRequirePhone] = React.useState(false);
  const [questions, setQuestions] = React.useState<Draft[]>([newQuestion()]);

  function update(key: string, patch: Partial<Draft>) {
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((qs) => {
      const next = [...qs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createSurvey({
        title,
        description,
        pointsPerResponse: Number(points),
        requireEmail,
        requirePhone,
        // `key` is a local list identity only; the server assigns order_index.
        questions: questions.map((q) => ({
          type: q.type,
          prompt: q.prompt,
          help_text: q.help_text,
          options: q.options,
          required: q.required,
        })),
      });

      if (result.ok) {
        toast.success(result.message, {
          description: "Publish it when you're ready — that's what sends links out.",
        });
        router.push("/admin/surveys");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* ─── Survey details ──────────────────────────────────────────────── */}
      <Card>
        <CardBody className="space-y-4">
          <Field label="Title" htmlFor="title" required>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Campus food delivery habits"
              required
              autoFocus
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            hint="Shown to respondents above the first question."
          >
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Five quick questions about how often you order in."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Points per response"
              htmlFor="points"
              hint="What the ambassador earns per valid response."
              required
            >
              <Input
                id="points"
                type="number"
                min={0}
                max={1000}
                step={1}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                required
              />
            </Field>

            <fieldset>
              <legend className="mb-1.5 block text-[13px] font-medium text-ink">
                Respondent details
              </legend>
              <div className="space-y-2">
                <Toggle
                  checked={requireEmail}
                  onChange={setRequireEmail}
                  label="Require email"
                />
                <Toggle
                  checked={requirePhone}
                  onChange={setRequirePhone}
                  label="Require phone"
                />
              </div>
              <p className="mt-1.5 text-[12.5px] text-ink-soft">
                Duplicate detection uses these. Turning both off makes the
                survey much easier to farm.
              </p>
            </fieldset>
          </div>

          {!requireEmail && !requirePhone && (
            <Note tone="warn">
              With neither required, nothing stops one person submitting the
              same survey repeatedly for someone else&apos;s points.
            </Note>
          )}
        </CardBody>
      </Card>

      {/* ─── Questions ───────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-extrabold tracking-wide text-ink-soft uppercase">
            Questions ({questions.length})
          </h2>
        </div>

        {questions.map((question, index) => {
          const type = TYPES.find((t) => t.value === question.type);
          const needsOptions = Boolean(type?.hasOptions);

          return (
            <Card key={question.key}>
              <CardBody className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-xs bg-poll-tint text-[12px] font-bold text-poll"
                  >
                    {index + 1}
                  </span>
                  <GripVertical className="size-4 text-ink-faint" aria-hidden />

                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Move down"
                      disabled={index === questions.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Remove"
                      disabled={questions.length === 1}
                      onClick={() =>
                        setQuestions((qs) =>
                          qs.filter((q) => q.key !== question.key),
                        )
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>

                <Field label="Question" htmlFor={`prompt-${question.key}`} required>
                  <Input
                    id={`prompt-${question.key}`}
                    value={question.prompt}
                    onChange={(e) => update(question.key, { prompt: e.target.value })}
                    placeholder="How often do you order food in a typical week?"
                    required
                  />
                </Field>

                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-ink">Type</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        title={t.hint}
                        onClick={() =>
                          update(question.key, {
                            type: t.value,
                            options: t.hasOptions
                              ? question.options?.length
                                ? question.options
                                : ["", ""]
                              : [],
                          })
                        }
                        className={cn(
                          "rounded-xs border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                          question.type === t.value
                            ? "border-poll-line bg-poll-tint text-poll"
                            : "border-line bg-surface text-ink-soft hover:bg-canvas-sunk",
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {needsOptions && (
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium text-ink">
                      Options
                      <span className="ml-1 font-normal text-ink-soft">
                        (at least two)
                      </span>
                    </p>

                    <div className="space-y-2">
                      {(question.options ?? []).map((option, optionIndex) => (
                        <div key={optionIndex} className="flex gap-2">
                          <Input
                            value={option}
                            onChange={(e) => {
                              const next = [...(question.options ?? [])];
                              next[optionIndex] = e.target.value;
                              update(question.key, { options: next });
                            }}
                            placeholder={`Option ${optionIndex + 1}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Remove option"
                            disabled={(question.options ?? []).length <= 2}
                            onClick={() =>
                              update(question.key, {
                                options: (question.options ?? []).filter(
                                  (_, i) => i !== optionIndex,
                                ),
                              })
                            }
                          >
                            <X aria-hidden />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        update(question.key, {
                          options: [...(question.options ?? []), ""],
                        })
                      }
                    >
                      <Plus aria-hidden />
                      Add option
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4">
                  <Toggle
                    checked={question.required}
                    onChange={(checked) => update(question.key, { required: checked })}
                    label="Required"
                  />
                </div>
              </CardBody>
            </Card>
          );
        })}

        <Button
          type="button"
          variant="secondary"
          onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
        >
          <Plus aria-hidden />
          Add question
        </Button>
      </div>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/admin/surveys")}
        >
          Cancel
        </Button>
        <Button type="submit" loading={pending} disabled={!title.trim()}>
          Save as draft
        </Button>
      </div>
    </form>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-brand)]"
      />
      {label}
    </label>
  );
}
