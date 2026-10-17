"use client";

import * as React from "react";
import { toast } from "sonner";

import { ZONE_LABEL, ZONES, type Zone } from "@/components/zone-pill";
import { setAmbassadorZone } from "@/lib/admin/zone-actions";
import { cn } from "@/lib/utils";

/** The same three colours as `ZonePill`, so the picker reads as the pill. */
const TONE: Record<Zone, string> = {
  red: "border-rose-200 bg-rose-50 text-rose-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/**
 * Pick an ambassador's zone in place.
 *
 * A native select drawn as the zone pill: one tab stop, the platform picker
 * on a phone, and the colour changes the moment it is chosen. If the save
 * fails it snaps back, so the colour on screen is never one the database
 * does not hold.
 */
export function ZoneSelect({
  profileId,
  zone,
  name,
  className,
}: {
  profileId: string;
  zone: Zone;
  name: string;
  className?: string;
}) {
  const [value, setValue] = React.useState<Zone>(zone);
  const [pending, startTransition] = React.useTransition();

  // A save elsewhere (the other page, another admin) arrives as a new prop.
  // Adjusted during render rather than in an effect, so there is no frame
  // showing the stale colour.
  const [seen, setSeen] = React.useState<Zone>(zone);
  if (zone !== seen) {
    setSeen(zone);
    setValue(zone);
  }

  function change(next: Zone) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await setAmbassadorZone(profileId, next);
      if (result.ok) {
        toast.success(result.message);
      } else {
        setValue(previous);
        toast.error(result.message);
      }
    });
  }

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(event) => change(event.target.value as Zone)}
      aria-label={`Zone for ${name}`}
      className={cn(
        "h-7 cursor-pointer rounded-full border px-2 text-[11.5px] font-bold",
        "focus:ring-2 focus:ring-brand/40 focus:outline-none disabled:opacity-60",
        TONE[value],
        className,
      )}
    >
      {ZONES.map((option) => (
        <option key={option} value={option}>
          {ZONE_LABEL[option].replace(" zone", "")}
        </option>
      ))}
    </select>
  );
}
