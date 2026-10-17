import { cn } from "@/lib/utils";

/**
 * Red, orange and green zones.
 *
 * A zone is a call an admin makes, not a figure: red for the ambassadors to
 * act on, orange for the ones to watch. Both are set by hand and stored in
 * `ambassador_zones` (0055); anybody without a row there is green. One set of
 * colours for the ambassadors list and both Analytics tables.
 */
export const ZONES = ["red", "orange", "green"] as const;
export type Zone = (typeof ZONES)[number];

/** The zone for someone, given the hand-set ones. No row is green. */
export function zoneOf(id: string, zones: Map<string, Zone>): Zone {
  return zones.get(id) ?? "green";
}

export const ZONE_LABEL: Record<Zone, string> = {
  red: "Red zone",
  orange: "Orange zone",
  green: "Green zone",
};

const ZONE_SHORT: Record<Zone, string> = {
  red: "Red",
  orange: "Orange",
  green: "Green",
};

const ZONE_PILL: Record<Zone, string> = {
  red: "bg-rose-50 text-rose-700",
  orange: "bg-orange-50 text-orange-700",
  green: "bg-emerald-50 text-emerald-700",
};

/** "Red · 7". The count is optional where a Downloads column already has it. */
export function ZonePill({
  zone,
  downloads,
  className,
}: {
  zone: Zone;
  /** Shown after the zone when given. */
  downloads?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap",
        ZONE_PILL[zone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {ZONE_SHORT[zone]}
      {downloads !== undefined && ` · ${downloads}`}
    </span>
  );
}
