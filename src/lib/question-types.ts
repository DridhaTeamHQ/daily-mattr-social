import type { Enums } from "@/lib/database.types";

/**
 * The question types, as an admin sees them.
 *
 * Shared by the builder and the editor so a type cannot be called "Pick one"
 * on one screen and something else on the other — and so adding a type later
 * is one edit rather than two that drift.
 */
export const QUESTION_TYPES: {
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

/** Whether a type carries a list of choices. */
export function typeHasOptions(type: string): boolean {
  return type === "single_choice" || type === "multi_choice";
}
