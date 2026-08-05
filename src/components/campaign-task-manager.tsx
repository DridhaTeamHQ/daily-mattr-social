"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import {
  addCampaignTask,
  removeCampaignTask,
  updateCampaignTask,
} from "@/lib/admin/campaign-tasks";
import { PLATFORM_TONE, SOCIAL_PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/**
 * Add, reprice and remove the tasks on a campaign.
 *
 * A campaign used to be four fixed Instagram actions chosen at creation and
 * frozen. Real ones run across networks and get adjusted after launch, so this
 * exists — but with two rules the UI states rather than hides:
 *
 * A task somebody has already submitted against cannot be deleted; setting it
 * to zero points closes it without erasing their work or the ledger row that
 * paid for it. And repricing only affects future approvals — points already
 * paid stay paid.
 */

export type ManagedTask = {
  id: string;
  label: string;
  platform: string | null;
  points: number;
  required: boolean;
  instructions: string | null;
  submitted: number;
};

export type LibraryOption = {
  id: string;
  label: string;
  platform: string | null;
  default_points: number;
  proof_type: string;
};

const SELECT =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-[13.5px] font-semibold text-ink focus:border-brand focus:outline-none";

export function CampaignTaskManager({
  campaignId,
  tasks,
  library,
  campaignPlatform,
}: {
  campaignId: string;
  tasks: ManagedTask[];
  library: LibraryOption[];
  campaignPlatform: string;
}) {
  const [adding, setAdding] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  // The campaign's own network first — that is what is being built nine times
  // out of ten — but every task stays reachable, because one campaign
  // legitimately spans networks.
  const sorted = React.useMemo(() => {
    const mine = library.filter((l) => l.platform === campaignPlatform);
    const rest = library.filter((l) => l.platform !== campaignPlatform);
    return [...mine, ...rest];
  }, [library, campaignPlatform]);

  const [choice, setChoice] = React.useState(sorted[0]?.id ?? "");
  const selected = sorted.find((l) => l.id === choice);
  const [points, setPoints] = React.useState(selected?.default_points ?? 10);

  // Adjusted during render rather than in an effect. Picking a different task
  // should reset the points to that task's default, and doing it in an effect
  // renders once with the previous number visible before correcting itself.
  const [pointsFor, setPointsFor] = React.useState(choice);
  if (pointsFor !== choice) {
    setPointsFor(choice);
    setPoints(selected?.default_points ?? 10);
  }

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          campaignId={campaignId}
          task={task}
          pending={pending}
          onRun={run}
        />
      ))}

      {adding ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            run(async () => {
              const result = await addCampaignTask(campaignId, formData);
              if (result.ok) setAdding(false);
              return result;
            });
          }}
          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
                Task
              </span>
              <select
                name="library_id"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                className={cn(SELECT, "mt-1.5")}
              >
                {sorted.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.platform ? `${option.platform} · ` : ""}
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
                Network
              </span>
              <select
                name="platform"
                defaultValue={selected?.platform ?? campaignPlatform}
                key={selected?.platform ?? campaignPlatform}
                className={cn(SELECT, "mt-1.5")}
              >
                {SOCIAL_PLATFORMS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-3 block">
            <span className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
              Rename it (optional)
            </span>
            <input
              name="label"
              placeholder={selected?.label ?? ""}
              className={cn(SELECT, "mt-1.5")}
            />
          </label>

          {/* Hidden but posted: the proof type comes from the library row, so a
              Reddit link task never asks for an Instagram screenshot. */}
          <input
            type="hidden"
            name="proof_type"
            value={selected?.proof_type ?? "screenshot"}
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Stepper
              name="points"
              label="Points"
              value={points}
              onChange={setPoints}
              min={0}
              max={1000}
              step={5}
            />
            <label className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <input type="checkbox" name="required" className="size-4" />
              Required
            </label>

            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setAdding(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={pending}>
                Add task
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setAdding(true)}
          disabled={library.length === 0}
        >
          <Plus aria-hidden />
          Add a task
        </Button>
      )}
    </div>
  );
}

function TaskRow({
  campaignId,
  task,
  pending,
  onRun,
}: {
  campaignId: string;
  task: ManagedTask;
  pending: boolean;
  onRun: (fn: () => Promise<{ ok: boolean; message: string }>) => void;
}) {
  const [points, setPoints] = React.useState(task.points);
  const dirty = points !== task.points;
  const locked = task.submitted > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border p-3.5",
        task.points === 0
          ? "border-dashed border-gray-200 bg-gray-50"
          : "border-gray-200 bg-white",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-extrabold text-ink">
            {task.label}
          </span>
          {task.platform && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                PLATFORM_TONE[task.platform] ?? "bg-gray-100 text-ink-soft",
              )}
            >
              {task.platform}
            </span>
          )}
          {!task.required && (
            <span className="text-[11.5px] font-bold text-ink-faint">
              optional
            </span>
          )}
          {task.points === 0 && (
            <span className="text-[11.5px] font-bold text-ink-faint">
              closed — worth nothing
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-ink-soft">
          {task.submitted} submission{task.submitted === 1 ? "" : "s"}
          {task.instructions ? ` · ${task.instructions}` : ""}
        </p>
      </div>

      <Stepper
        label={`${task.label} points`}
        value={points}
        onChange={setPoints}
        min={0}
        max={1000}
        step={5}
      />

      {dirty && (
        <Button
          size="sm"
          loading={pending}
          onClick={() => {
            const formData = new FormData();
            formData.set("points", String(points));
            formData.set("label", task.label);
            formData.set("platform", task.platform ?? "");
            formData.set("instructions", task.instructions ?? "");
            if (task.required) formData.set("required", "on");
            onRun(() => updateCampaignTask(task.id, campaignId, formData));
          }}
        >
          Save
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        aria-label={`Remove ${task.label}`}
        // Disabled rather than hidden, with the reason in the tooltip: a
        // missing button reads as a bug, a disabled one reads as a rule.
        disabled={locked || pending}
        title={
          locked
            ? "Already has submissions — set it to zero points to close it instead"
            : "Remove this task"
        }
        onClick={() => onRun(() => removeCampaignTask(task.id, campaignId))}
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}
