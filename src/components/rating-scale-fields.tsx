"use client";

import { Input } from "@/components/ui/input";
import { DEFAULT_RATING_LABELS, ratingLabelSlots } from "@/lib/question-types";

/**
 * What 1 to 5 mean, in the admin's own words.
 *
 * Shared by the builder and the editor so the same rating question cannot be
 * described one way while it is being written and another way while it is
 * being corrected.
 *
 * The boxes arrive filled in with Bad / Fair / Good / Very good / Excellent
 * and are all editable — a rating that ships named is right more often than
 * one that ships blank, and typing over five words is quicker than inventing
 * them. They are laid out as the scale itself, five across, rather than as a
 * list that hides which number each one belongs to.
 */
export function RatingScaleFields({
  options,
  disabled = false,
  onChange,
}: {
  options: string[] | undefined;
  /** True once answers exist: a 3 already given cannot be renamed under it. */
  disabled?: boolean;
  onChange: (labels: string[]) => void;
}) {
  const labels = ratingLabelSlots(options);

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink">
        What each number means
        <span className="ml-1 font-normal text-ink-soft">
          (shown under the number on the survey — change any of them)
        </span>
      </p>

      <div className="grid gap-2 sm:grid-cols-5">
        {labels.map((label, index) => (
          <label
            key={index}
            className="flex items-center gap-2 sm:flex-col sm:items-stretch sm:gap-1"
          >
            <span className="w-5 shrink-0 text-[12.5px] font-extrabold text-ink sm:w-auto sm:text-center">
              {index + 1}
            </span>
            <Input
              className="min-w-0 flex-1"
              value={label}
              disabled={disabled}
              placeholder={DEFAULT_RATING_LABELS[index]}
              aria-label={`What ${index + 1} means`}
              onChange={(event) =>
                onChange(
                  labels.map((current, i) =>
                    i === index ? event.target.value : current,
                  ),
                )
              }
            />
          </label>
        ))}
      </div>

      <p className="mt-1.5 text-[12.5px] text-ink-soft">
        {disabled
          ? "Locked — people have already answered on this scale."
          : "Clear one to leave that number unnamed. Clear all five and the defaults come back."}
      </p>
    </div>
  );
}
