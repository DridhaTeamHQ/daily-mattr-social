import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Which run of the programme a screen is about.
 *
 * The programme is run more than once. V1 is everything up to the first
 * restart; V2 begins again at nought. Nothing from an earlier run is moved,
 * rewritten or removed — every counted row carries the run it belongs to (see
 * migration 0047), so starting again is a new number in a column rather than a
 * deletion, and V1 stays readable in full for as long as the database exists.
 *
 * ─── Two different questions ───────────────────────────────────────────────
 *
 * `getActiveVersion()` is "which run is open" — the one new work is written
 * into. Every student screen asks this and nothing else: a student is doing
 * the programme that is running now, and the one before it is not their
 * business or their score.
 *
 * `getViewingVersion()` is "which run is this admin looking at". It defaults
 * to the open one and can be pointed at an earlier one, which is how last
 * run's final standings stay reachable after the restart. It is the only
 * reason the two are separate functions.
 *
 * ─── Where the version is applied ──────────────────────────────────────────
 *
 * Inside each read model, never by its callers. An admin page that had to
 * remember to pass a version is a page that will one day forget, and a
 * forgotten filter here does not fail loudly — it quietly adds V1's 839
 * downloads to V2's total and reads as a suspiciously good first week. So the
 * admin read models call `getViewingVersion()` themselves, the student ones
 * call `getActiveVersion()`, and a page cannot get it wrong by omission.
 *
 * Both are `cache()`d, so the settings read happens once per render however
 * many models ask.
 */

/** The run the admin console is pointed at. Session-scoped, like the preview. */
export const VERSION_COOKIE = "dm_version";

/** There is always at least one run, and it is numbered from one. */
export const FIRST_VERSION = 1;

export type ProgrammeVersion = {
  id: number;
  label: string;
  description: string | null;
  /** When the run opened. Null until it has been made active. */
  startedAt: string | null;
  /** When the next run took over. Null on the run still in progress. */
  endedAt: string | null;
  /** True for the one run new work is currently written into. */
  isActive: boolean;
};

/**
 * The run new work belongs to.
 *
 * Mirrors `current_programme_version()` in SQL, including its fallback: a
 * missing, unparseable or unknown setting reads as the first run rather than
 * raising. The database is the authority — this is the same answer, read
 * without a round trip per query.
 */
export const getActiveVersion = cache(async (): Promise<number> => {
  // Demo mode has no database to ask, and one run is the honest answer for a
  // set of fixtures.
  if (!isSupabaseConfigured()) return FIRST_VERSION;

  try {
    const { data } = await createAdminClient()
      .from("app_settings")
      .select("value")
      .eq("key", "active_programme_version")
      .maybeSingle();

    const parsed = Number(data?.value);
    if (!Number.isInteger(parsed) || parsed < FIRST_VERSION) return FIRST_VERSION;
    return parsed;
  } catch {
    // Every read model calls this. A settings table that cannot be reached
    // must degrade to the first run, not take down every page at once.
    return FIRST_VERSION;
  }
});

/** Every run, oldest first, with the open one marked. */
export const listVersions = cache(async (): Promise<ProgrammeVersion[]> => {
  if (!isSupabaseConfigured()) {
    return [
      {
        id: FIRST_VERSION,
        label: "V1",
        description: null,
        startedAt: null,
        endedAt: null,
        isActive: true,
      },
    ];
  }

  const [{ data }, active] = await Promise.all([
    createAdminClient()
      .from("programme_versions")
      .select("id, label, description, started_at, ended_at")
      .order("id", { ascending: true }),
    getActiveVersion(),
  ]);

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    description: row.description,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    isActive: row.id === active,
  }));
});

/** One run by id, for naming it on a page. */
export async function getVersion(id: number): Promise<ProgrammeVersion | null> {
  return (await listVersions()).find((version) => version.id === id) ?? null;
}

/**
 * The run the admin console is reading.
 *
 * The cookie is a request, not a fact, and survives only three tests: the
 * caller is an active admin, the value is a whole number, and it names a run
 * that exists. Anything else falls back to the open run, so a stale cookie
 * left over from a deleted run shows the current programme rather than an
 * empty console nobody can explain.
 *
 * The admin check is a live profile read rather than anything carried in the
 * cookie. Student screens never call this — they call `getActiveVersion()` —
 * so a forged cookie changes nothing even before the check; the check is here
 * because "it happens to be unreachable" is not a property worth relying on.
 */
export const getViewingVersion = cache(async (): Promise<number> => {
  const active = await getActiveVersion();
  if (!isSupabaseConfigured()) return active;

  const requested = (await cookies()).get(VERSION_COOKIE)?.value;
  if (!requested) return active;

  const parsed = Number(requested);
  if (!Number.isInteger(parsed) || parsed === active) return active;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return active;

  const { data: actor } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (actor?.role !== "admin" || actor.status !== "active") return active;

  const exists = (await listVersions()).some((version) => version.id === parsed);
  return exists ? parsed : active;
});

/**
 * What the admin console is looking at, and whether that is the live run.
 *
 * One call rather than three, because every screen that names the run needs
 * all of it: the number to filter by, the label to print, and whether to say
 * out loud that this is history.
 */
export type ViewingScope = {
  version: number;
  label: string;
  /** False when an earlier run is being read. Nothing can be edited there. */
  isActive: boolean;
  /** Every run, for the switcher. */
  versions: ProgrammeVersion[];
};

/**
 * How long a fresh season is worth announcing on a student's own dashboard.
 *
 * The message exists to answer one question — "where did my score go" — and
 * that question is asked in the days after a restart, not in the weeks after.
 * A banner that never leaves stops being read, and by the third week the
 * board has a shape of its own and the explanation is just clutter.
 */
export const NEW_SEASON_DAYS = 14;

export type SeasonNotice = {
  label: string;
  /** Whole days since it opened. Zero on the day itself. */
  days: number;
};

/**
 * The "we have started again" line, or null when there is nothing to say.
 *
 * Null in three cases, each for its own reason: on the very first run, where
 * "new season" would be announcing the only season there has ever been; once
 * the run is older than the window above; and whenever a run has no start
 * date, which means it has never actually been opened.
 */
export const getNewSeasonNotice = cache(
  async (): Promise<SeasonNotice | null> => {
    const versions = await listVersions();
    const active = versions.find((version) => version.isActive);

    if (!active || active.id <= FIRST_VERSION || !active.startedAt) return null;

    const startedAt = new Date(active.startedAt).getTime();
    if (!Number.isFinite(startedAt)) return null;

    const days = Math.floor((Date.now() - startedAt) / 86_400_000);
    // A negative span means the clock disagrees with the database rather than
    // that the season is in the future; treat it as today and say nothing odd.
    if (days < 0 || days > NEW_SEASON_DAYS) return null;

    return { label: active.label, days };
  },
);

export const getViewingScope = cache(async (): Promise<ViewingScope> => {
  const [version, versions] = await Promise.all([
    getViewingVersion(),
    listVersions(),
  ]);

  const current = versions.find((entry) => entry.id === version);

  return {
    version,
    label: current?.label ?? `V${version}`,
    isActive: current?.isActive ?? true,
    versions,
  };
});
