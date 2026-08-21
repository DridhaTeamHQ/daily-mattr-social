"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { addCampaignTask, removeCampaignTask } from "@/lib/admin/campaign-tasks";
import { PLATFORM_TONE } from "@/lib/platforms";
import { cn } from "@/lib/utils";

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

const SELECT = "h-10 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-[13.5px] font-semibold text-ink focus:border-brand focus:outline-none";

export function CampaignTaskManager({ campaignId, tasks, library, campaignPlatform }: {
  campaignId: string;
  tasks: ManagedTask[];
  library: LibraryOption[];
  campaignPlatform: string;
}) {
  const [adding, setAdding] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const sorted = React.useMemo(() => {
    const mine = library.filter((item) => item.platform === campaignPlatform);
    const rest = library.filter((item) => item.platform !== campaignPlatform);
    return [...mine, ...rest];
  }, [library, campaignPlatform]);
  const [choice, setChoice] = React.useState(sorted[0]?.id ?? "");
  const selected = sorted.find((item) => item.id === choice);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-extrabold text-ink">{task.label}</span>
              {task.platform && task.platform !== campaignPlatform && (
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", PLATFORM_TONE[task.platform] ?? "bg-gray-100 text-ink-soft")}>{task.platform}</span>
              )}
              {!task.required && <span className="text-[11.5px] font-bold text-ink-faint">optional</span>}
            </div>
            <p className="mt-0.5 text-[12px] text-ink-soft">{task.submitted} submission{task.submitted === 1 ? "" : "s"}{task.instructions ? ` - ${task.instructions}` : ""}</p>
          </div>
          <Button size="sm" variant="ghost" aria-label={`Remove ${task.label}`} disabled={task.submitted > 0 || pending} title={task.submitted > 0 ? "Already has submissions, so this task is kept for the audit trail" : "Remove this task"} onClick={() => run(() => removeCampaignTask(task.id, campaignId))}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}

      {adding ? (
        <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => { const result = await addCampaignTask(campaignId, data); if (result.ok) setAdding(false); return result; }); }} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <label className="block"><span className="text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">Task</span><select name="library_id" value={choice} onChange={(event) => setChoice(event.target.value)} className={cn(SELECT, "mt-1.5")}>{sorted.map((item) => <option key={item.id} value={item.id}>{item.platform ? `${item.platform} - ` : ""}{item.label}</option>)}</select></label>
          <input type="hidden" name="platform" value={campaignPlatform} />
          <input type="hidden" name="proof_type" value={selected?.proof_type ?? "screenshot"} />
          <input type="hidden" name="points" value={selected?.default_points ?? 0} />
          <label className="mt-3 block"><span className="text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">Rename it (optional)</span><input name="label" placeholder={selected?.label ?? ""} className={cn(SELECT, "mt-1.5")} /></label>
          {/* Ticked to start with, matching the column default. An unticked box
              submits nothing, so the old default silently added optional tasks
              that never counted towards finishing the campaign. */}
          <div className="mt-3 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-[13px] font-semibold text-ink"><input type="checkbox" name="required" defaultChecked className="size-4" />Required</label><div className="ml-auto flex gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" size="sm" loading={pending}>Add task</Button></div></div>
        </form>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={library.length === 0}><Plus aria-hidden />Add a task</Button>
      )}
    </div>
  );
}
