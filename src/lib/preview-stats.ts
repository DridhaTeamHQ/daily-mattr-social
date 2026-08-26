import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { SurveyStat } from "@/lib/queries";

/**
 * The `my_*` RPCs, rewritten to take an ambassador id.
 *
 * `my_survey_stats`, `my_referral_stats` and `my_streak` all filter on
 * `auth.uid()` inside the function body, so an admin previewing a student
 * cannot call them for that student — they would answer for the admin, which
 * is the empty result that made the preview worthless in the first place.
 *
 * These read the same tables through the admin's own session, which RLS
 * already allows (`*_select_admin` / `*_all_admin`), and reproduce the SQL
 * rather than approximating it. Approximating would be worse than showing
 * nothing: a preview exists to be trusted about what a student sees, and a
 * plausible wrong number is indistinguishable from a right one.
 *
 * Only used while previewing. A student's own screens still go through the
 * RPCs, untouched.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

/** Mirrors `my_survey_stats()` for one ambassador. */
export async function previewSurveyStats(
  supabase: Client,
  ambassadorId: string,
): Promise<SurveyStat[]> {
  const { data: links } = await supabase
    .from("survey_links")
    .select("id, slug, click_count, survey_id, surveys!inner(id, title, status, created_at)")
    .eq("ambassador_id", ambassadorId);

  // Live surveys only, exactly as the RPC's `s.status = 'live'` does.
  const live = (links ?? []).filter(
    (l) => (l.surveys as unknown as { status: string } | null)?.status === "live",
  );
  if (live.length === 0) return [];

  const linkIds = live.map((l) => l.id);

  const [{ data: responses }, { data: ledger }] = await Promise.all([
    supabase
      .from("survey_responses")
      .select("id, survey_link_id, status")
      .in("survey_link_id", linkIds),
    supabase
      .from("point_ledger")
      .select("delta, source_id")
      .eq("ambassador_id", ambassadorId)
      .eq("reason", "survey_response"),
  ]);

  // Which survey each response belongs to, so ledger rows can be attributed.
  const surveyOfLink = new Map(live.map((l) => [l.id, l.survey_id]));
  const surveyOfResponse = new Map<string, string>();
  for (const r of responses ?? []) {
    const surveyId = surveyOfLink.get(r.survey_link_id);
    if (surveyId) surveyOfResponse.set(r.id, surveyId);
  }

  const pointsBySurvey = new Map<string, number>();
  for (const row of ledger ?? []) {
    const surveyId = row.source_id ? surveyOfResponse.get(row.source_id) : undefined;
    if (!surveyId) continue;
    pointsBySurvey.set(surveyId, (pointsBySurvey.get(surveyId) ?? 0) + row.delta);
  }

  const stats = live.map((link) => {
    const survey = link.surveys as unknown as {
      id: string;
      title: string;
      created_at: string;
    };
    const mine = (responses ?? []).filter((r) => r.survey_link_id === link.id);

    return {
      stat: {
        survey_id: survey.id,
        survey_title: survey.title,
        slug: link.slug,
        click_count: link.click_count,
        valid_responses: mine.filter((r) => r.status === "valid").length,
        // The RPC counts flagged and duplicate together under `flagged`.
        flagged: mine.filter(
          (r) => r.status === "flagged" || r.status === "duplicate",
        ).length,
        points_earned: pointsBySurvey.get(survey.id) ?? 0,
      } satisfies SurveyStat,
      createdAt: survey.created_at,
    };
  });

  // `order by s.created_at desc`.
  return stats
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((s) => s.stat);
}

/** Mirrors `my_referral_stats()` for one ambassador. */
export async function previewReferralStats(
  supabase: Client,
  ambassadorId: string,
  fallbackCode: string,
): Promise<{
  code: string;
  total_confirmed: number;
  points_earned: number;
  last_conversion: string | null;
}> {
  const [{ data: conversions }, { data: ledger }] = await Promise.all([
    supabase
      .from("referral_conversions")
      .select("status, converted_at")
      .eq("ambassador_id", ambassadorId),
    supabase
      .from("point_ledger")
      .select("delta")
      .eq("ambassador_id", ambassadorId)
      .eq("reason", "referral"),
  ]);

  const counted = (conversions ?? []).filter((c) => c.status === "counted");

  return {
    code: fallbackCode,
    total_confirmed: counted.length,
    points_earned: (ledger ?? []).reduce((sum, row) => sum + row.delta, 0),
    last_conversion:
      counted
        .map((c) => c.converted_at)
        .filter((at): at is string => Boolean(at))
        .sort()
        .at(-1) ?? null,
  };
}

/**
 * Mirrors `my_streak()` for one ambassador.
 *
 * The sources are the ones the SQL unions: a day the student opened the app,
 * points credited, proof uploaded, a response arriving through their link, and
 * a referral converting. A day counts if any of them happened on it.
 *
 * One branch of the SQL is deliberately not mirrored: `my_streak()` counts
 * today unconditionally, because the student calling it is by definition here
 * today. An admin opening a preview is not the student showing up, so a
 * preview shows today only if there is an `active_days` row to say so.
 *
 * The run is counted in Asia/Kolkata, like the SQL, and only counts when it
 * reaches today or yesterday — a streak that ended last week is over, not a
 * streak of the length it once was.
 */
export async function previewStreak(
  supabase: Client,
  ambassadorId: string,
): Promise<number> {
  const [visits, ledger, uploads, responses, referrals] = await Promise.all([
    supabase
      .from("active_days")
      .select("day")
      .eq("ambassador_id", ambassadorId),
    supabase
      .from("point_ledger")
      .select("created_at")
      .eq("ambassador_id", ambassadorId)
      .gt("delta", 0),
    supabase
      .from("submissions")
      .select("uploaded_at")
      .eq("ambassador_id", ambassadorId),
    supabase
      .from("survey_responses")
      .select("submitted_at")
      .eq("ambassador_id", ambassadorId),
    supabase
      .from("referral_conversions")
      .select("converted_at")
      .eq("ambassador_id", ambassadorId)
      .not("converted_at", "is", null),
  ]);

  const stamps = [
    ...(ledger.data ?? []).map((row) => row.created_at),
    ...(uploads.data ?? []).map((row) => row.uploaded_at),
    ...(responses.data ?? []).map((row) => row.submitted_at),
    ...(referrals.data ?? []).map((row) => row.converted_at),
  ].filter((at): at is string => Boolean(at));

  const days = new Set(stamps.map((at) => kolkataDay(at)));

  // `active_days.day` is already a date in IST — a stored day, not an instant.
  // Putting it through kolkataDay() would shift it forward by the offset it has
  // already had applied, so it goes in as it comes out of the database.
  for (const row of visits.data ?? []) days.add(row.day);

  if (days.size === 0) return 0;

  const today = kolkataDay(new Date().toISOString());
  const sorted = [...days].filter((d) => d <= today).sort().reverse();

  const newest = sorted[0];
  if (!newest || newest < dayBefore(today)) return 0;

  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] !== dayBefore(sorted[i - 1])) break;
    run += 1;
  }
  return run;
}

/** `(created_at at time zone 'Asia/Kolkata')::date`, as `YYYY-MM-DD`. */
function kolkataDay(iso: string): string {
  // +05:30 with no DST, so a fixed offset is exact rather than a simplification.
  const shifted = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
