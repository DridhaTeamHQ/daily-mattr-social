/**
 * Demo data for the portal.
 *
 * Fills an empty programme with something to look at: ambassadors across the
 * three cities, live campaigns and surveys, responses, screenshots in every
 * review state, confirmed downloads, and the points that all of it earns.
 *
 * Two rules it follows, because this runs against the production database:
 *
 *  1. Everything it writes is findable again. Ambassadors are the only thing
 *     with a durable marker (their email domain); campaigns and surveys are
 *     matched by the exact titles below. The cleanup script removes precisely
 *     those and nothing else.
 *  2. Points are written the way the app writes them — the same deltas, the
 *     same source_type — so every total, league table and breakdown reconciles
 *     instead of merely looking populated.
 *
 * Order matters: a live survey plus a new ambassador auto-issues that
 * ambassador's personal link (migration 0011), so surveys are published first
 * and the links arrive by themselves.
 *
 *   npx tsx scripts/seed-demo.mts        # seed
 *
 * Removing it is `scripts/seed-demo-clean.sql`, run in the SQL editor, rather
 * than a flag here. `point_ledger.ambassador_id` cascades from `profiles`, and
 * the ledger's append-only trigger refuses that cascade — so deleting a demo
 * ambassador through the API fails outright while their points exist. Undoing
 * this needs to briefly disable that trigger, which is a SQL-only operation
 * and too sharp an edge to hide behind a CLI flag.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const DEMO_DOMAIN = "demo.local";

/** Exact titles, so cleanup can match without polluting what an admin reads. */
const CAMPAIGN_TITLES = [
  "Reel: why campus news is broken",
  "Shorts: 60-second exam bulletin",
  "Thread: what your college isn't telling you",
];
const SURVEY_TITLES = ["News app usage", "How campus news reaches you"];

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const AMBASSADORS = [
  { name: "Aarthi Reddy",    college: "GIET",            city: "Hyderabad",  batch: "Batch A" },
  { name: "Sai Kiran",       college: "GIET",            city: "Hyderabad",  batch: "Batch A" },
  { name: "Nikhil Varma",    college: "VNR VJIET",       city: "Hyderabad",  batch: "Batch A" },
  { name: "Divya Sharma",    college: "VNR VJIET",       city: "Hyderabad",  batch: "Batch B" },
  { name: "Rahul Chowdary",  college: "SRKR Engineering", city: "Vijayawada", batch: "Batch A" },
  { name: "Meghana Rao",     college: "SRKR Engineering", city: "Vijayawada", batch: "Batch B" },
  { name: "Praveen Kumar",   college: "Andhra Loyola",   city: "Vijayawada", batch: "Batch B" },
  { name: "Sneha Patil",     college: "NIT Warangal",    city: "Warangal",   batch: "Batch A" },
  { name: "Arjun Teja",      college: "NIT Warangal",    city: "Warangal",   batch: "Batch B" },
  { name: "Lakshmi Priya",   college: "KITS Warangal",   city: "Warangal",   batch: "Batch B" },
];

const QUESTIONS: Record<string, {
  type: string; prompt: string; options: string[]; max_select?: number;
}[]> = {
  "News app usage": [
    { type: "single_choice", prompt: "How often do you read news on your phone?", options: ["Several times a day", "Daily", "A few times a week", "Rarely"] },
    { type: "multi_choice",  prompt: "Which apps do you use? (select all)", options: ["Inshorts", "Google News", "BBC", "The Hindu", "Instagram"], max_select: 3 },
    { type: "rating",        prompt: "How satisfied are you with them?", options: [] },
    { type: "number",        prompt: "Minutes a day on news?", options: [] },
    { type: "short_text",    prompt: "One feature you wish existed?", options: [] },
  ],
  "How campus news reaches you": [
    { type: "single_choice", prompt: "Where do you first hear campus news?", options: ["WhatsApp groups", "Instagram", "Friends", "Noticeboard"] },
    { type: "multi_choice",  prompt: "What would you actually read?", options: ["Exam updates", "Placements", "Events", "Sports", "Clubs"], max_select: 3 },
    { type: "rating",        prompt: "How reliable is what you hear?", options: [] },
    { type: "short_text",    prompt: "What gets missed?", options: [] },
  ],
};

const ANSWERS: Record<string, string[]> = {
  single_choice: [],
  multi_choice: [],
  short_text: ["Offline reading", "Fewer notifications", "Local campus section", "Dark mode", "Shorter summaries"],
};

const rnd = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

// ─── Seed ───────────────────────────────────────────────────────────────────

async function seed() {
  const { count: existing } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .like("email", `%@${DEMO_DOMAIN}`);

  if (existing) {
    console.log(`Demo data is already there (${existing} ambassadors).`);
    console.log("Run scripts/seed-demo-clean.sql first if you want it re-seeded.");
    return;
  }

  // ── Surveys first: a live survey plus a new ambassador auto-issues links.
  console.log("Surveys…");
  const surveyIds: Record<string, string> = {};
  for (const title of SURVEY_TITLES) {
    const { data: survey, error } = await db
      .from("surveys")
      .insert({
        title,
        description:
          title === "News app usage"
            ? "Two minutes on how you read the news. No wrong answers."
            : "Where campus news actually reaches you, and what gets missed.",
        status: "live",
        points_per_response: 10,
        require_email: false,
        require_phone: false,
      })
      .select("id")
      .single();
    if (error) throw error;
    surveyIds[title] = survey.id;

    await db.from("survey_questions").insert(
      QUESTIONS[title].map((q, i) => ({
        survey_id: survey.id,
        order_index: i,
        type: q.type as never,
        prompt: q.prompt,
        options: q.options,
        required: true,
        max_select: q.max_select ?? null,
      })),
    );
  }

  // ── Campaigns
  console.log("Campaigns…");
  const platforms = ["Instagram", "YouTube", "X"];
  const taskIds: string[] = [];
  for (const [i, title] of CAMPAIGN_TITLES.entries()) {
    const { data: campaign, error } = await db
      .from("campaigns")
      .insert({
        title,
        description: "Post it, screenshot it, upload the screenshot here.",
        instagram_url: `https://instagram.com/p/dailymattr-${i + 1}`,
        status: "live",
        platform: platforms[i],
      })
      .select("id")
      .single();
    if (error) throw error;

    const { data: tasks } = await db
      .from("campaign_tasks")
      .insert([
        { campaign_id: campaign.id, type: "like", points: 10, order_index: 0, platform: platforms[i], required: true },
        { campaign_id: campaign.id, type: "comment", points: 15, order_index: 1, platform: platforms[i], required: true },
      ])
      .select("id");
    for (const t of tasks ?? []) taskIds.push(t.id);
  }

  // ── Ambassadors (links auto-issue on insert)
  console.log("Ambassadors…");
  const people: { id: string; name: string }[] = [];
  for (const [i, a] of AMBASSADORS.entries()) {
    const email = `${a.name.toLowerCase().replace(/[^a-z]+/g, ".")}@${DEMO_DOMAIN}`;
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: a.name, college: a.college },
    });
    if (error) throw error;
    people.push({ id: data.user!.id, name: a.name });

    // city and batch are not carried by the signup trigger.
    await db.from("profiles").update({ city: a.city, batch: a.batch }).eq("id", data.user!.id);
    if (i === 0) console.log(`  (passwords are random — these are for looking at, not signing into)`);
  }

  // ── Survey responses, with the credit each one earns
  console.log("Survey responses…");
  const { data: links } = await db
    .from("survey_links")
    .select("id, survey_id, ambassador_id")
    .in("survey_id", Object.values(surveyIds));

  const { data: questions } = await db
    .from("survey_questions")
    .select("id, survey_id, type, options")
    .in("survey_id", Object.values(surveyIds));

  let responseCount = 0;
  const ledger: Record<string, unknown>[] = [];

  for (const link of links ?? []) {
    // A believable spread: some ambassadors collect well, some barely.
    const howMany = rnd([0, 2, 4, 6, 8, 11, 14]);
    for (let n = 0; n < howMany; n++) {
      const { data: response } = await db
        .from("survey_responses")
        .insert({
          survey_link_id: link.id,
          survey_id: link.survey_id,
          ambassador_id: link.ambassador_id,
          respondent_name: null,
          status: "valid",
        })
        .select("id")
        .single();
      if (!response) continue;
      responseCount++;

      const qs = (questions ?? []).filter((q) => q.survey_id === link.survey_id);
      await db.from("survey_answers").insert(
        qs.map((q) => {
          const opts = (q.options as string[]) ?? [];
          let value: unknown;
          if (q.type === "rating") value = 1 + Math.floor(Math.random() * 5);
          else if (q.type === "number") value = 5 + Math.floor(Math.random() * 55);
          else if (q.type === "short_text") value = rnd(ANSWERS.short_text);
          else value = opts.length ? rnd(opts) : "—";
          return { response_id: response.id, question_id: q.id, value: value as never };
        }),
      );

      ledger.push({
        ambassador_id: link.ambassador_id,
        delta: 10,
        reason: "survey_response",
        source_type: "survey_response",
        source_id: response.id,
        note: "Survey response",
      });
    }
  }

  // ── Campaign submissions in every review state
  console.log("Submissions…");
  for (const person of people) {
    for (const taskId of taskIds) {
      if (Math.random() < 0.45) continue; // not everyone does everything
      const roll = Math.random();
      const status = roll < 0.65 ? "approved" : roll < 0.85 ? "pending" : "rejected";

      const { data: submission } = await db
        .from("submissions")
        .insert({
          campaign_task_id: taskId,
          ambassador_id: person.id,
          status: status as never,
          proof_url: "https://instagram.com/p/dailymattr-proof",
          reject_reason: status === "rejected" ? "Handle not visible in the screenshot" : null,
          reviewed_at: status === "pending" ? null : new Date().toISOString(),
        })
        .select("id, campaign_task_id")
        .single();
      if (!submission || status !== "approved") continue;

      const { data: task } = await db
        .from("campaign_tasks")
        .select("points")
        .eq("id", submission.campaign_task_id)
        .single();

      ledger.push({
        ambassador_id: person.id,
        delta: task?.points ?? 10,
        reason: "instagram_task",
        source_type: "submission",
        source_id: submission.id,
        note: "Screenshot approved",
      });
    }
  }

  // ── Confirmed downloads
  console.log("Downloads…");
  const { data: codes } = await db
    .from("profiles")
    .select("id, referral_code")
    .like("email", `%@${DEMO_DOMAIN}`);

  for (const person of codes ?? []) {
    const downloads = rnd([0, 3, 7, 12, 18, 26, 34]);
    if (!downloads) continue;

    const rows = Array.from({ length: downloads }, (_, n) => ({
      ambassador_id: person.id,
      code: person.referral_code,
      external_user_ref: `demo-${person.id}-${n}`,
      source: "api" as const,
      status: "counted" as const,
      store: rnd(["play_store", "app_store", "unknown"]) as never,
    }));

    const { data: inserted } = await db
      .from("referral_conversions")
      .insert(rows)
      .select("id");

    for (const row of inserted ?? []) {
      ledger.push({
        ambassador_id: person.id,
        delta: 100,
        reason: "referral",
        source_type: "referral_conversion",
        source_id: row.id,
        note: "App download confirmed",
      });
    }
  }

  // ── The points, in one go
  console.log(`Points (${ledger.length} ledger rows)…`);
  for (let i = 0; i < ledger.length; i += 500) {
    const { error } = await db.from("point_ledger").insert(ledger.slice(i, i + 500) as never);
    if (error) throw error;
  }

  const total = ledger.reduce((sum, r) => sum + (r.delta as number), 0);

  console.log("\n─── Done");
  console.table([
    { thing: "ambassadors", n: people.length },
    { thing: "campaigns", n: CAMPAIGN_TITLES.length },
    { thing: "surveys", n: SURVEY_TITLES.length },
    { thing: "survey links", n: links?.length ?? 0 },
    { thing: "responses", n: responseCount },
    { thing: "ledger rows", n: ledger.length },
    { thing: "points issued", n: total },
  ]);
  console.log("\nRemove it all by running scripts/seed-demo-clean.sql in the SQL editor.");
}

await seed();
