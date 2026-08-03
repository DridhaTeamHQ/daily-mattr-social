/**
 * Shared filtering helper.
 *
 * Deliberately NOT in `components/search-box.tsx`: that file is `"use client"`,
 * which makes every export in it a client reference. Server Components filtering
 * a list would then be calling a client function across the boundary, which
 * fails at runtime even though it type-checks.
 *
 * No `"use client"` and no `server-only` here — this is plain code that both
 * sides are allowed to run.
 */
export function matches(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => (field ?? "").toLowerCase().includes(needle));
}
