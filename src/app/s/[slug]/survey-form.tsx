"use client";

import Image from "next/image";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck, Maximize2, X } from "lucide-react";
import * as React from "react";

import { submitSurvey, type SubmitState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import { ratingLabels } from "@/lib/question-types";
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
  /** Optional picture shown with the question. See migration 0050. */
  image_url: string | null;
  /** Pictures for the choices, indexed to match `options`. */
  option_images: (string | null)[];
};

/**
 * A picture attached to a question or one of its choices.
 *
 * `object-contain`, not `cover`. A choice's picture is the choice — a poster
 * or a screenshot cropped to a square thumbnail is a corner of a poster, and
 * whoever is answering has to guess at the rest. Letterboxing against the sunk
 * background wastes a little space and shows the whole thing.
 *
 * `unoptimized`, because these are already sized by whoever uploaded them and
 * this page is built to be opened by a lecture hall at once — routing every
 * image through the optimiser would put a transform in front of the one page
 * that must stay fast.
 *
 * The alt text is deliberately empty. The label beside it is the question, or
 * the choice; describing the picture again would make a screen reader read
 * every option twice. Where an image carries meaning the label carries it too,
 * because the answer is recorded as the label.
 */
function QuestionImage({
  src,
  className,
  sizes = "(max-width: 640px) 100vw, 640px",
  /**
   * Off inside a choice card, which has a heavy border of its own — two of
   * them a millimetre apart reads as a rendering fault rather than as a frame.
   */
  framed = true,
}: {
  src: string;
  className?: string;
  sizes?: string;
  framed?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative block overflow-hidden bg-canvas-sunk",
        framed ? "rounded-lg border-[3px] border-ink" : "rounded-md",
        className,
      )}
    >
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        sizes={sizes}
        className="object-contain"
      />
    </span>
  );
}

/**
 * Opens one picture at the size it was uploaded.
 *
 * A card's picture is a few centimetres wide, and some of these are posters
 * with words on them. The card cannot simply grow: six of them down a page is
 * a page nobody scrolls to the bottom of, and the point of a choice list is
 * that the choices are comparable at a glance.
 *
 * ─── Why it is a sibling of the label, positioned over it ───────────────
 *
 * A choice's picture lives inside its `<label>`, so that tapping the picture
 * picks the option — a photograph you cannot click is a photograph everyone
 * tries to click. Putting the magnifier inside that label too would be a
 * button inside a label: invalid, and a real trap for anyone tabbing through,
 * where the button and the choice it sits on both answer to the same click.
 *
 * So it is a sibling, absolutely positioned into the picture's corner by the
 * wrapper. Valid markup, one meaning per click, and it still reads as part of
 * the picture rather than as a control parked next to the card.
 */
function ViewButton({ src, label }: { src: string; label: string }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll while the picture is over it, or a
    // thumb aimed at the image drags the survey around underneath it.
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = scroll;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View the picture for ${label} full size`}
        className="absolute top-3.5 right-3.5 z-10 grid size-8 place-items-center rounded-md border-2 border-ink bg-surface/90 text-ink backdrop-blur-sm transition hover:bg-surface hover:shadow-[2px_2px_0_var(--color-ink)]"
      >
        <Maximize2 className="size-3.5" aria-hidden />
      </button>

      {/*
        Rendered into `<body>`, not where it sits in the tree.

        `position: fixed` is only relative to the viewport while no ancestor
        has a transform, filter or containment. The question card has an entry
        animation on `transform`, which leaves it with an identity matrix for
        good — enough to make it the containing block. The overlay then opened
        *inside the card*: no full-screen backdrop, a close button off at the
        card's corner, the picture running past the bottom of the screen, and
        the page underneath locked against scrolling. On a phone there was no
        way out of it.

        Escaping to the body is the fix rather than hunting that one animation
        down, because any ancestor anyone adds later would do the same thing
        again, and an overlay that covers the screen should not depend on what
        it happens to be nested in.
      */}
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Picture for ${label}`}
          // Anywhere on the backdrop closes it, which is what everyone tries
          // first and what the close button is only the fallback for.
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex flex-col bg-ink/85 p-3 sm:p-4"
        >
          {/*
            The close button gets a row of its own rather than a corner laid
            over the picture.
            
            Over the picture it was unreachable on a phone: the image takes the
            whole screen at that width, and being later in the document it
            simply painted on top of the button. Even raised above it, a white
            button over a pale photograph is invisible. A row reserves the
            space instead, so the button is always on the backdrop and always
            in the same place.
          */}
          <div className="flex shrink-0 justify-end pb-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-sm border-[3px] border-ink bg-surface text-ink transition-transform hover:-translate-y-px"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {/* `min-h-0`, or the picture refuses to shrink below its natural
              height and pushes the close button off the top of a phone. */}
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {/* Plain `img` rather than `next/image`: the whole point here is
                the picture at whatever size it was uploaded, and `fill` would
                need a box with an aspect ratio nobody knows yet. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              onClick={(event) => event.stopPropagation()}
              className="max-h-full max-w-full rounded-lg border-[3px] border-ink bg-canvas-sunk object-contain"
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * One choice — a plain row, or a card with the picture above the words.
 *
 * Shared by the radio list and the checkbox list, which differ only in the
 * input they put in front of the label, and differed in nothing else even
 * before the pictures — which is how the picture came to be added twice.
 *
 * ─── Why the picture goes above the label and not beside it ────────────
 *
 * Beside it, the picture gets whatever width the words leave over — which on
 * a phone is a stamp, and a poster shrunk to a stamp is a grey rectangle. The
 * choice is then made on the words, and the picture is decoration that cost a
 * scroll. Above, it gets the full width of the card and is the first thing
 * read, which is the whole reason for attaching one.
 *
 * ─── Why `gallery` is a property of the question, not of the choice ─────
 *
 * A question where one choice has a picture and two do not still lays all
 * three out as cards. Mixing a tall card and a thin row down one list reads as
 * a rendering fault, and the picture-less choices look like they failed to
 * load rather than like choices that never had one.
 */
function Choice({
  image,
  label,
  gallery,
  checkedClass,
  disabled,
  input,
}: {
  image: string | null;
  label: string;
  /** True when any choice in this question has a picture. */
  gallery: boolean;
  /** How this question colours the chosen card. */
  checkedClass: string;
  disabled?: boolean;
  input: React.ReactNode;
}) {
  if (!gallery) {
    return (
      <label className={cn(CHOICE_LABEL, checkedClass, disabled && CHOICE_BLOCKED)}>
        {input}
        <span className="min-w-0">{label}</span>
      </label>
    );
  }

  return (
    <div className="relative">
      <label
        className={cn(
          "flex h-full cursor-pointer flex-col rounded-sm border-[3px] border-ink bg-surface p-2.5 text-[14.5px] font-bold text-ink transition-transform",
          "hover:-translate-x-px hover:-translate-y-px",
          checkedClass,
          disabled && CHOICE_BLOCKED,
        )}
      >
        {image && (
          <QuestionImage
            src={image}
            sizes="(max-width: 640px) 100vw, 320px"
            framed={false}
            /* 4:3 rather than a fixed height, so a row of cards lines up
               whatever shape the pictures inside them are. */
            className="mb-2.5 aspect-[4/3] w-full"
          />
        )}
        <span className="mt-auto flex items-center gap-2.5">
          {input}
          <span className="min-w-0">{label}</span>
        </span>
      </label>

      {image && <ViewButton src={image} label={label} />}
    </div>
  );
}

const initial: SubmitState = { status: "idle", message: "" };

function SubmitButton({ preview }: { preview: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full"
      loading={pending}
      disabled={preview}
    >
      Submit answers
    </Button>
  );
}

export function SurveyForm({
  slug,
  questions,
  requireEmail,
  requirePhone,
  askWhoYouAre = true,
  preview = false,
}: {
  slug: string;
  questions: PublicQuestion[];
  requireEmail: boolean;
  requirePhone: boolean;
  /**
   * False on a participant survey. The ambassador is signed in, so the account
   * already says who they are, and asking again would be a form asking a
   * question it can answer itself.
   */
  askWhoYouAre?: boolean;
  /**
   * Admin preview. Every input still works — the point is to see what it feels
   * like to answer — but there is no link behind it, so nothing is submitted
   * and the button says so instead of failing.
   */
  preview?: boolean;
}) {
  /**
   * A preview has no action at all rather than a bound one that would be
   * refused: `slug` is empty here, so calling the real action would write
   * nothing and return an error the admin has to read past.
   */
  const action = preview
    ? async () => initial
    : submitSurvey.bind(null, slug);
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

              {question.image_url && (
                <div className="relative mt-3 ml-8 w-full max-w-md">
                  <QuestionImage
                    src={question.image_url}
                    sizes="(max-width: 640px) 100vw, 448px"
                    className="aspect-[16/10] w-full"
                  />
                  <ViewButton src={question.image_url} label={question.prompt} />
                </div>
              )}

              <div className="mt-3.5 ml-8">
                <QuestionInput question={question} />
              </div>
            </fieldset>
          </CardBody>
        </Card>
      ))}

      {/* ─── Who you are ───────────────────────────────────────────────── */}
      {askWhoYouAre && (
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
      )}

      {state.status === "error" && <Note tone="bad">{state.message}</Note>}

      <SubmitButton preview={preview} />

      <p className="pb-4 text-center text-[12px] leading-relaxed text-ink-faint">
        {preview
          ? "Preview — the button is off and nothing you type here is recorded."
          : "Your answers go to the dailymattr team. We don't store your IP address, only a scrambled version of it to stop duplicate entries."}
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
      return (
        <RatingInput
          name={name}
          required={question.required}
          labels={ratingLabels(question.options)}
        />
      );

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
 * A 1-to-5 scale, as radio inputs.
 *
 * This was five stars, which is a rating everyone recognises and nobody agrees
 * on: three stars means "fine" to one person and "disappointing" to the next,
 * and the survey then averages the two as if they had said the same thing. The
 * number is on the button and the admin's own words for it sit underneath, so
 * a 4 means what the survey says a 4 means.
 *
 * Native radios keep it keyboard accessible and make the value land in
 * FormData without any JavaScript — the styling is decoration on top. Only the
 * picked number highlights, not everything below it: on a labelled scale the
 * points are named positions, not a quantity being filled up.
 */
function RatingInput({
  name,
  required,
  labels,
}: {
  name: string;
  required: boolean;
  /** Five entries, index 0 being 1. Blank only where the admin cleared one. */
  labels: string[];
}) {
  const [value, setValue] = React.useState(0);

  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const label = labels[n - 1];
        const picked = value === n;

        return (
          <label
            key={n}
            className={cn(
              "flex cursor-pointer flex-col items-center rounded-sm border-[3px] border-ink px-1 py-2.5 text-center transition-transform",
              picked
                ? "-translate-x-px -translate-y-px bg-brand text-white shadow-[3px_3px_0_var(--color-ink)]"
                : "bg-surface text-ink hover:bg-canvas-sunk",
            )}
          >
            <input
              type="radio"
              name={name}
              value={n}
              required={required}
              checked={picked}
              onChange={() => setValue(n)}
              className="sr-only"
            />
            <span aria-hidden className="text-[19px] leading-none font-extrabold">
              {n}
            </span>

            {label && (
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 text-[11.5px] leading-tight font-bold",
                  picked ? "text-white" : "text-ink-soft",
                )}
              >
                {label}
              </span>
            )}

            {/* The visible number and label are decoration to a screen
                reader; this is the whole answer in one string. */}
            <span className="sr-only">
              {label ? `${n} — ${label}` : `${n} out of 5`}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const CHOICE_LABEL =
  "flex cursor-pointer items-center gap-2.5 rounded-sm border-[3px] border-ink bg-surface px-3.5 py-3 text-[14.5px] font-bold text-ink transition-transform hover:-translate-x-px hover:-translate-y-px";

/** Over the limit on a "pick many": greyed reads as a rule, dead reads as broken. */
const CHOICE_BLOCKED =
  "cursor-not-allowed opacity-45 hover:translate-x-0 hover:translate-y-0";

/**
 * How a question lays its choices out.
 *
 * Two to a row once there is room, so a set of posters can be compared
 * side by side rather than scrolled past one at a time. Plain choices keep
 * the single column they have always had.
 */
function choiceListClass(gallery: boolean) {
  return gallery ? "grid gap-2.5 sm:grid-cols-2" : "space-y-2";
}

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
  const gallery = question.option_images?.some(Boolean) ?? false;

  return (
    <div>
      <div className={choiceListClass(gallery)}>
        {question.options.map((option, index) => (
          <Choice
            key={option}
            image={question.option_images?.[index] ?? null}
            label={option}
            gallery={gallery}
            checkedClass="has-checked:bg-brand has-checked:text-white has-checked:shadow-[3px_3px_0_var(--color-ink)]"
            input={
              <input
                type="radio"
                name={name}
                value={option}
                required={question.required}
                onChange={() => setPicked(option)}
                className="size-4 shrink-0 accent-[var(--color-brand)]"
              />
            }
          />
        ))}
      </div>

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

  const gallery = question.option_images?.some(Boolean) ?? false;

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

      <div className={choiceListClass(gallery)}>
        {question.options.map((option, index) => {
          const checked = picked.includes(option);
          // Disabling rather than silently ignoring the click: an unresponsive
          // checkbox reads as broken, a greyed one reads as a rule.
          const blocked = !checked && atLimit;

          return (
            <Choice
              key={option}
              image={question.option_images?.[index] ?? null}
              label={option}
              gallery={gallery}
              disabled={blocked}
              checkedClass="has-checked:bg-poll has-checked:text-white has-checked:shadow-[3px_3px_0_var(--color-ink)]"
              input={
                <input
                  type="checkbox"
                  name={name}
                  value={option}
                  checked={checked}
                  disabled={blocked}
                  onChange={(event) => toggle(option, event.target.checked)}
                  className="size-4 shrink-0 accent-[var(--color-brand)]"
                />
              }
            />
          );
        })}
      </div>

      <OtherBox name={name} show={picked.some(isOtherOption)} />
    </div>
  );
}
