"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck, Star } from "lucide-react";
import * as React from "react";

import { submitSurvey, type SubmitState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import { isOtherOption } from "@/lib/survey-other";
import { cn } from "@/lib/utils";

export type PublicQuestion = {
  id: string;
  type: string;
  prompt: string;
  help_text: string | null;
  options: string[];
  required: boolean;
  /** null = pick as many as you like. */
  max_select: number | null;
};


const initial: SubmitState = { status: "idle", message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" loading={pending}>
      Submit answers
    </Button>
  );
}

export function SurveyForm({
  slug,
  questions,
  requireEmail,
  requirePhone,
}: {
  slug: string;
  questions: PublicQuestion[];
  requireEmail: boolean;
  requirePhone: boolean;
}) {
  const action = submitSurvey.bind(null, slug);
  const [state, formAction] = useActionState(action, initial);

  if (state.status === "done" || state.status === "already") {
    const already = state.status === "already";
    const Icon = already ? CircleAlert : CircleCheck;

    return (
      <Card>
        <CardBody className="py-12 text-center">
          <span
            aria-hidden
            className={cn(
              "brut animate-pop mx-auto grid size-20 place-items-center rounded-full",
              already ? "bg-warn" : "bg-rank",
            )}
          >
            <Icon className="size-10 text-ink" />
          </span>
          <h2 className="display mt-5 text-[26px] leading-tight text-ink">
            {state.message}
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
            {already
              ? "Only your first response counts, so this one wasn't recorded. You can close this page."
              : "You can close this page now."}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <form action={formAction} className="stagger space-y-4">
      {questions.map((question, index) => (
        <Card key={question.id}>
          <CardBody>
            <fieldset>
              <legend className="flex gap-2 text-[15px] font-bold text-ink">
                <span
                  aria-hidden
                  className="brut-sm grid size-7 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-extrabold text-ink"
                >
                  {index + 1}
                </span>
                <span>
                  {question.prompt}
                  {question.required && (
                    <span className="ml-0.5 text-bad" aria-hidden>
                      *
                    </span>
                  )}
                </span>
              </legend>

              {question.help_text && (
                <p className="mt-1.5 ml-8 text-[12.5px] text-ink-soft">
                  {question.help_text}
                </p>
              )}

              <div className="mt-3.5 ml-8">
                <QuestionInput question={question} />
              </div>
            </fieldset>
          </CardBody>
        </Card>
      ))}

      {/* ─── Who you are ───────────────────────────────────────────────── */}
      <Card>
        <CardBody className="space-y-4">
          <h2 className="display text-[18px] text-ink">About you</h2>

          <Field label="Name" htmlFor="respondent_name">
            <Input id="respondent_name" name="respondent_name" autoComplete="name" />
          </Field>

          <Field
            label="Email"
            htmlFor="respondent_email"
            required={requireEmail}
            hint="Only used to make sure nobody fills this in twice."
          >
            <Input
              id="respondent_email"
              name="respondent_email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required={requireEmail}
            />
          </Field>

          {requirePhone && (
            <Field label="Phone" htmlFor="respondent_phone" required>
              <Input
                id="respondent_phone"
                name="respondent_phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </Field>
          )}
        </CardBody>
      </Card>

      {state.status === "error" && <Note tone="bad">{state.message}</Note>}

      <SubmitButton />

      <p className="pb-4 text-center text-[12px] leading-relaxed text-ink-faint">
        Your answers go to the DailyMattr team. We don&apos;t store your IP
        address, only a scrambled version of it to stop duplicate entries.
      </p>
    </form>
  );
}

function QuestionInput({ question }: { question: PublicQuestion }) {
  const name = `q_${question.id}`;

  switch (question.type) {
    case "long_text":
      return <Textarea name={name} required={question.required} rows={4} />;

    case "single_choice":
      return <SingleChoice question={question} name={name} />;

    case "multi_choice":
      return <MultiChoice question={question} name={name} />;

    case "rating":
      return <RatingInput name={name} required={question.required} />;

    case "number":
      return (
        <Input type="number" name={name} inputMode="numeric" required={question.required} />
      );

    case "email":
      return (
        <Input type="email" name={name} inputMode="email" required={question.required} />
      );

    case "phone":
      return <Input type="tel" name={name} inputMode="tel" required={question.required} />;

    default:
      return <Input name={name} required={question.required} />;
  }
}

/**
 * Five stars, as radio inputs.
 *
 * Native radios keep it keyboard accessible and make the value land in
 * FormData without any JavaScript — the star styling is decoration on top.
 */
function RatingInput({ name, required }: { name: string; required: boolean }) {
  const [value, setValue] = React.useState(0);

  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <label
          key={n}
          title={`${n} out of 5`}
          className={cn(
            "cursor-pointer rounded-sm border-[3px] border-ink p-2 transition-transform",
            value >= n
              ? "bg-brand text-ink shadow-[3px_3px_0_var(--color-ink)] -translate-x-px -translate-y-px"
              : "bg-surface text-ink-faint hover:bg-canvas-sunk",
          )}
        >
          <input
            type="radio"
            name={name}
            value={n}
            required={required}
            checked={value === n}
            onChange={() => setValue(n)}
            className="sr-only"
          />
          <Star
            className="size-6"
            fill={value >= n ? "currentColor" : "none"}
            aria-hidden
          />
          <span className="sr-only">{n} out of 5</span>
        </label>
      ))}
    </div>
  );
}

const CHOICE_LABEL =
  "flex cursor-pointer items-center gap-2.5 rounded-sm border-[3px] border-ink bg-surface px-3.5 py-3 text-[14.5px] font-bold text-ink transition-transform hover:-translate-x-px hover:-translate-y-px";

/** The free-text box an "Other" option reveals. Posted alongside the choice. */
function OtherBox({ name, show }: { name: string; show: boolean }) {
  if (!show) return null;
  return (
    <Input
      name={`${name}_other`}
      placeholder="Tell us which one"
      aria-label="Describe your answer"
      className="mt-1"
      required
    />
  );
}

function SingleChoice({
  question,
  name,
}: {
  question: PublicQuestion;
  name: string;
}) {
  const [picked, setPicked] = React.useState("");

  return (
    <div className="space-y-2">
      {question.options.map((option) => (
        <label
          key={option}
          className={cn(CHOICE_LABEL, "has-checked:bg-brand has-checked:text-white has-checked:shadow-[3px_3px_0_var(--color-ink)]")}
        >
          <input
            type="radio"
            name={name}
            value={option}
            required={question.required}
            onChange={() => setPicked(option)}
            className="size-4 accent-[var(--color-brand)]"
          />
          {option}
        </label>
      ))}

      <OtherBox name={name} show={isOtherOption(picked)} />
    </div>
  );
}

function MultiChoice({
  question,
  name,
}: {
  question: PublicQuestion;
  name: string;
}) {
  const [picked, setPicked] = React.useState<string[]>([]);
  const limit = question.max_select;
  const atLimit = limit !== null && picked.length >= limit;

  function toggle(option: string, checked: boolean) {
    setPicked((current) =>
      checked
        ? [...current.filter((o) => o !== option), option]
        : current.filter((o) => o !== option),
    );
  }

  return (
    <div className="space-y-2">
      {limit !== null && (
        <p
          className={cn(
            "text-[12.5px] font-bold",
            atLimit ? "text-brand" : "text-ink-soft",
          )}
        >
          {atLimit
            ? `That's your ${limit}. Untick one to change your mind.`
            : `Pick up to ${limit} — ${limit - picked.length} left.`}
        </p>
      )}

      {question.options.map((option) => {
        const checked = picked.includes(option);
        // Disabling rather than silently ignoring the click: an unresponsive
        // checkbox reads as broken, a greyed one reads as a rule.
        const blocked = !checked && atLimit;

        return (
          <label
            key={option}
            className={cn(
              CHOICE_LABEL,
              "has-checked:bg-poll has-checked:text-white has-checked:shadow-[3px_3px_0_var(--color-ink)]",
              blocked && "cursor-not-allowed opacity-45 hover:translate-x-0 hover:translate-y-0",
            )}
          >
            <input
              type="checkbox"
              name={name}
              value={option}
              checked={checked}
              disabled={blocked}
              onChange={(event) => toggle(option, event.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            {option}
          </label>
        );
      })}

      <OtherBox name={name} show={picked.some(isOtherOption)} />
    </div>
  );
}
