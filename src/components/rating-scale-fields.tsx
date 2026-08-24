"use client";

import { Input } from "@/components/ui/input";
import { ratingLabelSlots } from "@/lib/question-types";

/**
 * What 1 to 5 mean, in the admin's own words.
 *
 * Shared by the builder and the editor so the same rating question cannot be
 * described one way while it is being written and another way while it is
 * being corrected.
 *
 * Every label is optional. Naming only the two ends is the usual shape of a
 * scale, and the form renders whatever is filled in — so the boxes are laid
 * out as the scale itself, five across, rather than a list that hides which
 * number each one belongs to.
 */
const PLACEHOLDERS = ["Never", "Rarely", "Sometimes", "Often", "Always"];

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
          (optional — labelling just 1 and 5 is usually enough)
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
              placeholder={PLACEHOLDERS[index]}
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
          : "Leave them all blank and the scale reads 1 (lowest) to 5 (highest)."}
      </p>
    </div>
  );
}
