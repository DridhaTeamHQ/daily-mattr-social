"use client";

import { useId, useMemo, useState } from "react";
import { Eye, Search } from "lucide-react";

import type { PreviewablePerson } from "@/lib/view-as-actions";
import { cn } from "@/lib/utils";

/**
 * A searchable list in place of a plain <select>.
 *
 * With forty-odd names a native dropdown means scrolling past most of the
 * programme to reach one person, and it cannot be typed into by college. This
 * matches on name or college, keeps the list open under the field, and submits
 * the chosen id through the same form field the select used.
 */
export function AmbassadorPicker({
  people,
  action,
}: {
  people: PreviewablePerson[];
  action: (formData: FormData) => Promise<void>;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<PreviewablePerson | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.college ?? "").toLowerCase().includes(q),
    );
  }, [people, query]);

  function choose(person: PreviewablePerson) {
    setChosen(person);
    setQuery(person.name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      // Enter picks the highlighted row rather than submitting a half-typed name.
      e.preventDefault();
      const person = matches[active];
      if (person) choose(person);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <form action={action} className="mt-3 flex flex-wrap items-start gap-2">
      <input type="hidden" name="ambassadorId" value={chosen?.id ?? ""} />

      <div className="relative w-full max-w-md">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Ambassador to preview
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-gray-400"
          aria-hidden
        />
        <input
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={`Search ${people.length} active ambassadors by name or college…`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setChosen(null);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Delayed so a click on a row lands before the list goes away.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pr-3 pl-8 text-[13.5px] font-semibold text-ink placeholder:font-normal placeholder:text-gray-400"
        />

        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white py-1 shadow-lg"
          >
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-gray-500">
                No active ambassador matches &ldquo;{query}&rdquo;.
              </li>
            ) : (
              matches.map((person, i) => (
                <li
                  key={person.id}
                  role="option"
                  aria-selected={chosen?.id === person.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(person)}
                  className={cn(
                    "cursor-pointer px-3 py-1.5 text-[13.5px] text-ink",
                    i === active && "bg-blue-50",
                  )}
                >
                  <span className="font-semibold">{person.name}</span>
                  {person.college && (
                    <span className="text-gray-500"> · {person.college}</span>
                  )}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={!chosen}
        className="tap inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-bold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Eye className="size-3.5" aria-hidden />
        View as
      </button>
    </form>
  );
}
