"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Choosing a campaign's tasks while creating it.
 *
 * The dialog used to offer four fixed Instagram actions with an editable
 * number beside each — you could change what a Like was worth, and nothing
 * else. This is the same editor the campaign page has, so a campaign starts
 * the way it can later be changed: pick from the library, rename it, set its
 * network, set its points, drop the ones you do not want.
 *
 * Tasks have no network of their own. The campaign picks one at the top of the
 * dialog and every task inherits it — a per-task dropdown repeated down the
 * list was both redundant and actively wrong-looking, since choosing Facebook
 * for the campaign left four rows still reading "Instagram".
 *
 * The whole list posts as one JSON field. Indexed form fields
 * (`tasks[0][points]`) would work too, but they turn every add and remove into
 * a re-indexing problem for no benefit.
 */

export type LibraryTask = {
  id: string;
  label: string;
  platform: string | null;
  default_points: number;
  proof_type: string;
};

export type DraftTask = {
  key: string;
  /** Null for a task somebody typed. The server files it in the library. */
  library_id: string | null;
  label: string;
  points: number;
  required: boolean;
  proof_type: string;
};

let nextKey = 0;

/**
 * The Instagram four, as a starting point.
 *
 * Still the common case, but they are ordinary rows now — renameable,
 * repriceable, removable — rather than a fixed grid.
 */
export function seedTasks(library: LibraryTask[]): DraftTask[] {
  const seed = ["Like the reel", "Leave a comment", "Share it", "Post to story"];
  return seed.flatMap((label) => {
    const found = library.find((l) => l.label === label);
    return found
      ? [
          {
            key: `t${nextKey++}`,
            library_id: found.id,
            label: found.label,
            points: found.default_points,
            required: label === "Like the reel" || label === "Leave a comment",
            proof_type: found.proof_type,
          },
        ]
      : [];
  });
}

/**
 * Controlled, so the dialog owns the list.
 *
 * The AI draft writes point values into these same rows, and the alternative —
 * the builder holding its own state and syncing from a prop in an effect — is
 * exactly the cascading-render pattern the compiler rejects elsewhere here.
 */
export function TaskDraftBuilder({
  library,
  platform,
  tasks,
  onChange,
}: {
  library: LibraryTask[];
  /** The campaign's network, so new tasks default to it. */
  platform: string;
  tasks: DraftTask[];
  onChange: (next: DraftTask[]) => void;
}) {
  const [picking, setPicking] = React.useState(false);
  const [choice, setChoice] = React.useState("");

  const sorted = React.useMemo(() => {
    const mine = library.filter((l) => l.platform === platform);
    const rest = library.filter((l) => l.platform !== platform);
    return [...mine, ...rest];
  }, [library, platform]);

  function update(key: string, patch: Partial<DraftTask>) {
    onChange(tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  /**
   * Adds whatever was typed.
   *
   * If the words match something in the library, the row inherits that item's
   * points and proof type — the library is still useful, it just no longer
   * decides what a task may be called. Anything else is a new task with the
   * defaults, which is the whole point of a text box.
   */
  function add(text: string) {
    const label = text.trim();
    if (!label) return;

    const known = library.find(
      (l) => l.label.toLowerCase() === label.toLowerCase(),
    );

    onChange([
      ...tasks,
      {
        key: `t${nextKey++}`,
        library_id: known?.id ?? null,
        label,
        points: known?.default_points ?? 10,
        required: false,
        proof_type: known?.proof_type ?? "screenshot",
      },
    ]);
    setPicking(false);
    setChoice("");
  }

  return (
    <div>
      {/* One hidden field carries the whole list to the server action. */}
      <input
        type="hidden"
        name="tasks"
        // `key` is a local list identity only; the server never sees it.
        value={JSON.stringify(
          tasks.map((t) => ({
            library_id: t.library_id,
            label: t.label,
            points: t.points,
            required: t.required,
            proof_type: t.proof_type,
          })),
        )}
      />

      <div className="space-y-2.5">
        {tasks.map((task) => (
          <div
            key={task.key}
            className="rounded-xl border border-gray-200 bg-white p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              {/* The label itself is an input. That is the thing that was
                  missing: "Like" was a hard-coded string nobody could touch. */}
              <input
                value={task.label}
                onChange={(e) => update(task.key, { label: e.target.value })}
                aria-label="Task name"
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[14px] font-extrabold text-ink hover:border-gray-200 focus:border-brand focus:bg-white focus:outline-none"
              />

              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Remove ${task.label}`}
                onClick={() =>
                  onChange(tasks.filter((t) => t.key !== task.key))
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft">
                <input
                  type="checkbox"
                  checked={task.required}
                  onChange={(e) =>
                    update(task.key, { required: e.target.checked })
                  }
                  className="size-4"
                />
                Required
              </label>

            </div>
          </div>
        ))}
      </div>

      {tasks.length === 0 && (
        <p className="mb-2 text-[12.5px] font-semibold text-ink-soft">
          A campaign needs at least one task.
        </p>
      )}

      {picking ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {/* Typed, not chosen. A dropdown made the library the vocabulary —
              every campaign had to be described in words somebody added
              months ago. The datalist keeps those words one keystroke away
              without making them the only ones allowed. */}
          <input
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            onKeyDown={(e) => {
              // Enter inside a dialog form would submit the campaign.
              if (e.key === "Enter") {
                e.preventDefault();
                add(choice);
              }
            }}
            list="dm-task-suggestions"
            placeholder="What should they do? e.g. Comment on the reel"
            aria-label="Task name"
            autoFocus
            className="min-w-56 flex-1 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-[14px] font-semibold text-ink focus:border-brand focus:outline-none"
          />
          <datalist id="dm-task-suggestions">
            {sorted.map((option) => (
              <option key={option.id} value={option.label}>
                {option.platform ?? ""}
              </option>
            ))}
          </datalist>
          <Button
            type="button"
            size="sm"
            disabled={!choice.trim()}
            onClick={() => add(choice)}
          >
            Add
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setPicking(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2.5"
          onClick={() => setPicking(true)}
        >
          <Plus aria-hidden />
          Add a task
        </Button>
      )}
    </div>
  );
}
