"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { cn } from "@/lib/utils";

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
  library_id: string;
  label: string;
  points: number;
  required: boolean;
  proof_type: string;
};

const SELECT =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-[13.5px] font-semibold text-ink focus:border-brand focus:outline-none";

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

  function add(libraryId: string) {
    const found = library.find((l) => l.id === libraryId);
    if (!found) return;
    onChange([
      ...tasks,
      {
        key: `t${nextKey++}`,
        library_id: found.id,
        label: found.label,
        points: found.default_points,
        required: false,
        proof_type: found.proof_type,
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

              <div className="ml-auto">
                <Stepper
                  label={`${task.label} points`}
                  value={task.points}
                  onChange={(points) => update(task.key, { points })}
                  min={0}
                  max={1000}
                  step={5}
                />
              </div>
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
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            aria-label="Task to add"
            className={cn(SELECT, "min-w-56 flex-1")}
          >
            <option value="">Choose a task…</option>
            {sorted.map((option) => (
              <option key={option.id} value={option.id}>
                {option.platform ? `${option.platform} · ` : ""}
                {option.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!choice}
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
