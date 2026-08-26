import { csvResponse } from "@/lib/admin/csv-export";
import { requireAdmin } from "@/lib/admin/queries";
import { readAll } from "@/lib/admin/read-all";
import { cohortLabel, readCohortFilters, DIMENSIONS } from "@/lib/admin/scope";
import { createClient } from "@/lib/supabase/server";

/**
 * The ambassador roster, with referral codes, as a CSV.
 *
 * ─── What it is scoped by, and what it deliberately is not ──────────────────
 *
 * The button that reaches this sits in the Analytics header, above two kinds
 * of filter, and they are not the same kind of thing:
 *
 *  * The cohort filters — city, college, batch — choose WHICH PEOPLE. Those are
 *    honoured. An admin who has narrowed the page to Batch 2 and then clicks
 *    Download expects batch 2, and handing them the whole programme is the
 *    export quietly answering a different question.
 *
 *  * The period — day, week, month, total — chooses A TIME WINDOW. That one is
 *    ignored on purpose. This is a roster: a person, their code, and what they
 *    have done since they joined. Slicing a roster by "this week" produces rows
 *    for people who did nothing this week, showing zeroes that read as "this
 *    ambassador has never delivered" rather than "not in the last seven days".
 *    Every figure here is lifetime, and the column names say so.
 *
 * Suspended and invited ambassadors are included, with their status in a
 * column. The page above only counts active ones because it is measuring the
 * programme's throughput; this is the contact list, and the person who left
 * last month is exactly who somebody opens it to find.
 */

export const dynamic = "force-dynamic";

type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  referral_code: string;
  city: string | null;
  college: string | null;
  batch: string | null;
  status: string;
  joined_as: string;
  created_at: string;
};

const APPROVED = new Set(["approved", "auto_approved"]);

/** `2026-08-26`, in IST, matching every other day boundary in the app. */
function istDay(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

export async function GET(request: Request) {
  // Its own guard. This URL can be typed straight into a browser and it
  // returns every ambassador's name, email and phone number.
  await requireAdmin();

  const url = new URL(request.url);
  const filters = readCohortFilters(
    Object.fromEntries(url.searchParams.entries()),
  );

  const supabase = await createClient();

  const [profiles, conversions, ledger, submissions, responses] =
    await Promise.all([
      readAll<Profile>(
        (from, to) =>
          supabase
            .from("profiles")
            .select(
              "id, full_name, email, phone, referral_code, city, college, batch, status, joined_as, created_at",
            )
            .eq("role", "ambassador")
            .order("id")
            .range(from, to),
          "export.profiles",
      ),
      readAll<{ ambassador_id: string; status: string; converted_at: string | null }>(
        (from, to) =>
          supabase
            .from("referral_conversions")
            .select("ambassador_id, status, converted_at")
            .order("id")
            .range(from, to),
        "export.conversions",
      ),
      readAll<{ ambassador_id: string; delta: number }>(
        (from, to) =>
          supabase
            .from("point_ledger")
            .select("ambassador_id, delta")
            .order("id")
            .range(from, to),
        "export.ledger",
      ),
      readAll<{ ambassador_id: string; campaign_task_id: string; status: string }>(
        (from, to) =>
          supabase
            .from("submissions")
            .select("ambassador_id, campaign_task_id, status")
            .order("id")
            .range(from, to),
        "export.submissions",
      ),
      readAll<{ ambassador_id: string | null; status: string }>(
        (from, to) =>
          supabase
            .from("survey_responses")
            .select("ambassador_id, status")
            .order("id")
            .range(from, to),
        "export.responses",
      ),
    ]);

  // ─── Roll the raw rows up per person ──────────────────────────────────────

  const confirmed = new Map<string, number>();
  const voided = new Map<string, number>();
  const lastDownload = new Map<string, string>();
  for (const row of conversions) {
    const bucket = row.status === "counted" ? confirmed : voided;
    bucket.set(row.ambassador_id, (bucket.get(row.ambassador_id) ?? 0) + 1);

    if (row.status === "counted" && row.converted_at) {
      const seen = lastDownload.get(row.ambassador_id);
      if (!seen || row.converted_at > seen) {
        lastDownload.set(row.ambassador_id, row.converted_at);
      }
    }
  }

  const points = new Map<string, number>();
  for (const row of ledger) {
    points.set(row.ambassador_id, (points.get(row.ambassador_id) ?? 0) + row.delta);
  }

  // Distinct tasks, not submissions. Someone who uploaded twice for one task
  // and had both approved has completed one task, and counting rows would
  // reward the double upload.
  const approvedTasks = new Map<string, Set<string>>();
  for (const row of submissions) {
    if (!APPROVED.has(row.status)) continue;
    const tasks = approvedTasks.get(row.ambassador_id) ?? new Set<string>();
    tasks.add(row.campaign_task_id);
    approvedTasks.set(row.ambassador_id, tasks);
  }

  const validResponses = new Map<string, number>();
  for (const row of responses) {
    if (row.status !== "valid" || !row.ambassador_id) continue;
    validResponses.set(
      row.ambassador_id,
      (validResponses.get(row.ambassador_id) ?? 0) + 1,
    );
  }

  // ─── Apply the cohort, the same way the page labels it ────────────────────
  //
  // `cohortLabel` rather than a raw string compare, because "hyderabad",
  // "Hyderabad" and "Hyderabad " are one city everywhere else in the app. A
  // different rule here would produce an export that disagrees with the page
  // it was downloaded from.
  const selected = profiles.filter((profile) =>
    DIMENSIONS.every(({ key }) => {
      const wanted = filters[key];
      if (wanted === null) return true;
      return cohortLabel(key, profile[key] ?? "") === wanted;
    }),
  );

  selected.sort(
    (left, right) =>
      (approvedTasks.get(right.id)?.size ?? 0) -
        (approvedTasks.get(left.id)?.size ?? 0) ||
      left.full_name.localeCompare(right.full_name),
  );

  const header = [
    "Name",
    "Email",
    "Phone",
    "Referral code",
    "City",
    "College/Office",
    "Batch",
    "Status",
    "Joined as",
    "Joined on",
    "Approved tasks (lifetime)",
    "Confirmed downloads (lifetime)",
    "Voided downloads",
    "Last download",
    "Valid survey responses (lifetime)",
    "Points balance",
  ];

  const rows = selected.map((profile) => [
    profile.full_name,
    profile.email,
    profile.phone ?? "",
    profile.referral_code,
    profile.city ?? "",
    profile.college ?? "",
    profile.batch ?? "",
    profile.status,
    profile.joined_as,
    istDay(profile.created_at),
    approvedTasks.get(profile.id)?.size ?? 0,
    confirmed.get(profile.id) ?? 0,
    voided.get(profile.id) ?? 0,
    lastDownload.get(profile.id) ? istDay(lastDownload.get(profile.id)!) : "",
    validResponses.get(profile.id) ?? 0,
    points.get(profile.id) ?? 0,
  ]);

  // The filename carries the scope, so two downloads taken minutes apart under
  // different filters do not end up as "ambassadors (1).csv" in a folder with
  // no way to tell which is which.
  const scope = DIMENSIONS.map(({ key }) => filters[key])
    .filter((value): value is string => Boolean(value))
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const filename = `ambassadors${scope ? `-${scope}` : ""}-${istDay(new Date())}.csv`;

  return csvResponse(filename, header, rows);
}
