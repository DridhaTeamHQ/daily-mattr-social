/**
 * Which choice labels open a "type your own" box, Google Forms style.
 *
 * Matching the label rather than adding a per-option flag keeps the question
 * editor a plain list of strings. The cost is that this has to be deliberate
 * about what counts, because a question could legitimately offer "Other
 * people's recommendations" as a real answer — and turning that into a text
 * box would eat the response.
 *
 * So: the label must BE "other" or "others", optionally followed by a
 * parenthetical or a dash/colon aside. Anything that continues into a real
 * phrase is a normal option.
 *
 *   Other                      ✓
 *   Others                     ✓
 *   Other (please specify)     ✓
 *   Others - tell us which     ✓
 *   Other people's picks       ✗ — a real answer
 *
 * Lives in its own module because the form renders the box and the server
 * action reads it back: two copies of this rule would drift, and the failure
 * is silent — a box that shows but whose text is dropped on submit.
 */
const OTHER = /^others?\s*(?:[([{:–—-].*)?$/i;

export function isOtherOption(option: string): boolean {
  return OTHER.test(option.trim());
}
