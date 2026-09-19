"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, History } from "lucide-react";
import { toast } from "sonner";

import { setViewingVersion } from "@/lib/admin/version-actions";
import type { ProgrammeVersion } from "@/lib/programme-version";
import { cn } from "@/lib/utils";

/**
 * Which run of the programme the admin console is reading.
 *
 * It lives in the top bar rather than on any one page because it governs all
 * of them at once — every figure under it changes when this changes, and a
 * control with that reach belongs where the person can see it whatever screen
 * they are on.
 *
 * Hidden entirely while there is only one run. A picker with a single option
 * is furniture, and until the programme has been run twice it would be a
 * permanent invitation to think about something that has not happened yet.
 *
 * A cookie rather than a URL parameter, so it survives every link in the
 * console. See `setViewingVersion` for why that trade was made.
 */
export function VersionSwitcher({
  versions,
  viewing,
}: {
  versions: ProgrammeVersion[];
  /** The run being read. Equals the open one unless history is being viewed. */
  viewing: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  if (versions.length < 2) return null;

  const current = versions.find((version) => version.id === viewing);
  const lookingBack = current ? !current.isActive : false;

  function choose(next: string) {
    const id = Number(next);
    if (!Number.isInteger(id) || id === viewing) return;

    startTransition(async () => {
      const result = await setViewingVersion(id);
      if (result.ok) {
        toast.success(result.message);
        // The cookie is read on the server, so the figures only change once
        // the page is asked for again.
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Programme run</span>

      {lookingBack && (
        <History
          aria-hidden
          className="pointer-events-none absolute left-2.5 size-3.5 text-amber-300"
        />
      )}

      <select
        value={String(viewing)}
        disabled={pending}
        onChange={(event) => choose(event.target.value)}
        className={cn(
          "h-8 appearance-none rounded-sm border bg-white/10 py-0 pr-7 text-[12.5px] font-semibold text-white",
          "focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-60",
          lookingBack
            ? "border-amber-300/70 pl-7 text-amber-100"
            : "border-white/20 pl-2.5",
        )}
      >
        {versions.map((version) => (
          // The open run says so, because "V2" and "V1" alone do not tell you
          // which one new work is being written into.
          <option key={version.id} value={String(version.id)} className="text-ink">
            {version.label}
            {version.isActive ? " · current" : ""}
          </option>
        ))}
      </select>

      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 size-3.5 text-white/60"
      />
    </label>
  );
}
