"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { CircleAlert, History, Layers, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/feedback";
import {
  setActiveVersion,
  startNextVersion,
} from "@/lib/admin/version-actions";
import type { ProgrammeVersion } from "@/lib/programme-version";
import { formatDate } from "@/lib/utils";

/**
 * Running the programme again.
 *
 * The one screen where a restart is started, and the one place that has to be
 * completely clear about what a restart does — because the words for it
 * ("reset", "start again", "from zero") all sound like deletion and this is
 * not deletion. Nothing is removed. Every campaign, response, install, point
 * and payout keeps the run it was earned in and stays readable through the
 * switcher in the top bar, for good.
 *
 * So the copy says that twice: once in the card, where somebody glancing at
 * it will read it, and once in the dialog, where somebody about to press the
 * button will.
 */
export function ProgrammeVersionCard({
  versions,
  viewing,
}: {
  versions: ProgrammeVersion[];
  viewing: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const active = versions.find((version) => version.isActive);
  const nextId = versions.reduce((max, v) => Math.max(max, v.id), 0) + 1;
  const lookingBack = viewing !== active?.id;

  function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await startNextVersion(formData);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function reopen(id: number, label: string) {
    if (
      !window.confirm(
        `Point new work back at ${label}? Anything recorded since the restart stays where it is — this only changes which run the next campaign, install or point is written into.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await setActiveVersion(id);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-xs bg-rank-tint text-rank"
            >
              <Layers className="size-4" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">
                Programme version
              </h2>
              <p className="text-[12.5px] text-ink-soft">
                {active?.label ?? "V1"} is running. Earlier runs are kept in
                full and stay readable.
              </p>
            </div>
          </div>

          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <Button size="sm" variant="secondary">
                Start {`V${nextId}`}
              </Button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]" />
              <Dialog.Content
                className={[
                  "animate-rise fixed z-50 bg-surface shadow-pop",
                  "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-lg p-5",
                  "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md",
                  "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6",
                ].join(" ")}
              >
                <Dialog.Close className="absolute top-5 right-5 rounded-sm opacity-70 transition-opacity hover:opacity-100 sm:top-6 sm:right-6">
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </Dialog.Close>

                <Dialog.Title className="pr-8 text-[16px] font-bold text-ink">
                  Start {`V${nextId}`}
                </Dialog.Title>
                <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                  The programme begins again at nought. {active?.label ?? "V1"}{" "}
                  is kept exactly as it is.
                </Dialog.Description>

                <form onSubmit={start} className="mt-4 space-y-4">
                  <Note tone="brand" title="What changes">
                    <ul className="list-disc space-y-1 pl-4">
                      <li>
                        Completion, points, installs, stipends, badges and
                        achievements all start empty.
                      </li>
                      <li>
                        Ambassadors keep their logins, referral codes, cities
                        and batches. The task library and every threshold carry
                        across.
                      </li>
                      <li>
                        Campaigns and surveys from {active?.label ?? "V1"} stop
                        appearing to students. Create the new run&rsquo;s work
                        as usual.
                      </li>
                      <li>
                        <strong className="font-bold text-ink">
                          Nothing is deleted.
                        </strong>{" "}
                        Switch runs in the top bar to read{" "}
                        {active?.label ?? "V1"} again at any time.
                      </li>
                    </ul>
                  </Note>

                  <Field label="Name" htmlFor="version-label" required>
                    <Input
                      id="version-label"
                      name="label"
                      defaultValue={`V${nextId}`}
                      maxLength={40}
                      required
                      autoFocus
                    />
                  </Field>

                  <Field
                    label="Note"
                    htmlFor="version-description"
                    hint="Optional. What this run is for."
                  >
                    <Textarea
                      id="version-description"
                      name="description"
                      maxLength={300}
                      placeholder="Second cohort, October intake."
                    />
                  </Field>

                  <div className="flex justify-end gap-2">
                    <Dialog.Close asChild>
                      <Button type="button" variant="secondary">
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Button type="submit" loading={pending}>
                      Start {`V${nextId}`}
                    </Button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>

        <ul className="mt-4 divide-y divide-line">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex flex-wrap items-center gap-2 py-2.5"
            >
              <span className="text-[13.5px] font-semibold text-ink">
                {version.label}
              </span>

              {version.isActive ? (
                <Badge tone="ok" dot>
                  current
                </Badge>
              ) : (
                <Badge tone="neutral">
                  <History className="size-3" aria-hidden />
                  history
                </Badge>
              )}

              {version.id === viewing && !version.isActive && (
                <Badge tone="warn">you are reading this one</Badge>
              )}

              <span className="ml-auto text-[12px] whitespace-nowrap text-ink-faint">
                {version.startedAt ? formatDate(version.startedAt) : "—"}
                {version.endedAt ? ` → ${formatDate(version.endedAt)}` : ""}
              </span>

              {/* The way back from a restart nobody meant. Only offered on a
                  run that is not the open one, because "make the current run
                  current" is not an action. */}
              {!version.isActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => reopen(version.id, version.label)}
                >
                  Make current
                </Button>
              )}
            </li>
          ))}
        </ul>

        {lookingBack && (
          <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink-soft">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
            Every figure on the console is currently{" "}
            {versions.find((v) => v.id === viewing)?.label ?? "an earlier run"}
            &rsquo;s, and nothing can be edited there. Switch back in the top
            bar to make changes.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
