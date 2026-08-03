/**
 * Seeds a fresh project with an admin, a handful of ambassadors, and enough
 * campaign / survey / points activity to see every screen in a real state.
 *
 *   npm run seed
 *
 * Idempotent: re-running updates the same rows rather than duplicating them.
 * Users are keyed by email, campaigns and surveys by title.
 *
 * Everything it creates is obviously fake (@dailymattr.test addresses). Delete
 * the lot with `npm run seed -- --clean`.
 */

import { randomBytes } from "node:crypto";

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Seed accounts are real auth users on a real project, so the password must
 * not be a literal in a file that gets committed. Set SEED_PASSWORD in
 * .env.local to choose one; otherwise a random password is generated and
 * printed at the end of the run.
 */
const PASSWORD =
  process.env.SEED_PASSWORD ||
  `Dm-${randomBytes(12).toString("base64url")}`;

const PEOPLE = [
  {
    email: "admin@dailymattr.test",
    full_name: "Priya Menon",
    role: "admin" as const,
    college: null,
  },
  {
    email: "ananya@dailymattr.test",
    full_name: "Ananya Rao",
    role: "ambassador" as const,
    college: "Christ University, Bengaluru",
  },
  {
    email: "rohan@dailymattr.test",
    full_name: "Rohan Mehta",
    role: "ambassador" as const,
    college: "VIT Vellore",
  },
  {
    email: "fatima@dailymattr.test",
    full_name: "Fatima Sheikh",
    role: "ambassador" as const,
    college: "Jamia Millia Islamia",
  },
  {
    email: "karthik@dailymattr.test",
    full_name: "Karthik Iyer",
    role: "ambassador" as const,
    college: "Anna University",
  },
  {
    email: "meera@dailymattr.test",
    full_name: "Meera Nair",
    role: "ambassador" as const,
    college: "Christ University, Bengaluru",
  },
  {
    email: "aditya@dailymattr.test",
    full_name: "Aditya Deshmukh",
    role: "ambassador" as const,
    college: "Savitribai Phule Pune University",
  },
];

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

async function findUserByEmail(email: string) {
  // listUsers is paginated; the seed set is small enough that one page is fine.
  const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function upsertUser(person: (typeof PEOPLE)[number]) {
  const existing = await findUserByEmail(person.email);

  if (existing) {
    await db.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      user_metadata: {
        full_name: person.full_name,
        college: person.college,
        role: person.role,
      },
    });
    return existing.id;
  }

  const { data, error } = await db.auth.admin.createUser({
    email: person.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: person.full_name,
      college: person.college,
      role: person.role,
    },
  });
  if (error) throw error;
  return data.user.id;
}

async function clean() {
  console.log("Removing seeded data…");

  const { data } = await db.auth.admin.listUsers({ perPage: 200 });
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith("@dailymattr.test")) {
      await db.auth.admin.deleteUser(u.id);
    }
  }

  // point_ledger rows go with their profiles via the FK cascade.
  await db.from("submissions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("campaign_tasks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("campaigns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("survey_answers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("survey_responses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("survey_questions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("survey_links").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("surveys").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("referral_conversions").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("Done.");
}

async function seed() {
  console.log("Seeding…\n");

  // ─── People ───────────────────────────────────────────────────────────────
  const ids: Record<string, string> = {};
  for (const person of PEOPLE) {
    ids[person.email] = await upsertUser(person);
    console.log(`  user   ${person.email.padEnd(28)} ${person.role}`);
  }

  const adminId = ids["admin@dailymattr.test"];
  const ambassadors = PEOPLE.filter((p) => p.role === "ambassador").map(
    (p) => ids[p.email],
  );

  // ─── Campaigns ────────────────────────────────────────────────────────────
  const campaignSpecs = [
    {
      title: "Monsoon reel — share it everywhere",
      description:
        "Our best-performing reel this quarter. Like it, drop a genuine comment, and put it on your story.",
      instagram_url: "https://www.instagram.com/reel/DEMO-monsoon/",
      caption_hint: "monsoon",
      status: "live" as const,
      ends_at: at(5),
      tasks: [
        { type: "like" as const, points: 10, instructions: "Like the reel from your own account.", required: true, order_index: 0 },
        { type: "comment" as const, points: 20, instructions: "Leave a comment that isn't just an emoji.", required: true, order_index: 1 },
        { type: "story" as const, points: 30, instructions: "Share to your story and tag @dailymattr.", required: false, order_index: 2 },
      ],
    },
    {
      title: "Founder interview clip",
      description: "Short clip from the founder Q&A. Likes and shares only.",
      instagram_url: "https://www.instagram.com/reel/DEMO-founder/",
      caption_hint: null,
      status: "live" as const,
      ends_at: at(12),
      tasks: [
        { type: "like" as const, points: 10, instructions: null, required: true, order_index: 0 },
        { type: "share" as const, points: 15, instructions: "Send it to at least three friends.", required: false, order_index: 1 },
      ],
    },
    {
      title: "Exam-week study playlist",
      description:
        "Carousel post going out before finals. Comment with your own study track.",
      instagram_url: "https://www.instagram.com/reel/DEMO-studyweek/",
      caption_hint: "study",
      status: "draft" as const,
      ends_at: at(30),
      tasks: [
        { type: "like" as const, points: 10, instructions: null, required: true, order_index: 0 },
        { type: "comment" as const, points: 25, instructions: "Name the track you study to.", required: true, order_index: 1 },
      ],
    },
  ];

  const taskIds: Record<string, string> = {};

  for (const spec of campaignSpecs) {
    const { data: existing } = await db
      .from("campaigns")
      .select("id")
      .eq("title", spec.title)
      .maybeSingle();

    let campaignId = existing?.id;

    if (!campaignId) {
      const { data, error } = await db
        .from("campaigns")
        .insert({
          title: spec.title,
          description: spec.description,
          instagram_url: spec.instagram_url,
          caption_hint: spec.caption_hint,
          status: spec.status,
          ends_at: spec.ends_at,
          created_by: adminId,
        })
        .select("id")
        .single();
      if (error) throw error;
      campaignId = data.id;
    }

    for (const task of spec.tasks) {
      const { data, error } = await db
        .from("campaign_tasks")
        .upsert(
          { campaign_id: campaignId, ...task },
          { onConflict: "campaign_id,type" },
        )
        .select("id")
        .single();
      if (error) throw error;
      taskIds[`${spec.title}::${task.type}`] = data.id;
    }

    console.log(`  camp   ${spec.title.slice(0, 40).padEnd(42)} ${spec.status}`);
  }

  // ─── Survey ───────────────────────────────────────────────────────────────
  const surveyTitle = "Campus food delivery habits";
  const { data: existingSurvey } = await db
    .from("surveys")
    .select("id")
    .eq("title", surveyTitle)
    .maybeSingle();

  let surveyId = existingSurvey?.id;
  if (!surveyId) {
    const { data, error } = await db
      .from("surveys")
      .insert({
        title: surveyTitle,
        description:
          "Five quick questions about how often you order in, and what you actually pay for delivery.",
        status: "live",
        points_per_response: 10,
        require_email: true,
        created_by: adminId,
      })
      .select("id")
      .single();
    if (error) throw error;
    surveyId = data.id;

    const questions = [
      { order_index: 0, type: "single_choice" as const, prompt: "How often do you order food in a typical week?", options: ["Never", "Once", "2–3 times", "4+ times"], required: true },
      { order_index: 1, type: "multi_choice" as const, prompt: "Which apps do you use?", options: ["Swiggy", "Zomato", "Campus canteen app", "Direct from the restaurant"], required: true },
      { order_index: 2, type: "rating" as const, prompt: "How fair do delivery fees feel right now?", options: [], required: true },
      { order_index: 3, type: "long_text" as const, prompt: "What would make you order more often?", options: [], required: false },
      { order_index: 4, type: "email" as const, prompt: "Your email, so we can send the results", options: [], required: true },
    ];

    const { error: qError } = await db.from("survey_questions").insert(
      questions.map((q) => ({
        survey_id: surveyId!,
        order_index: q.order_index,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        required: q.required,
      })),
    );
    if (qError) throw qError;
  }

  const { data: linkCount, error: linkError } = await db.rpc(
    "ensure_survey_links",
    { target_survey: surveyId },
  );
  if (linkError) throw linkError;
  console.log(`  survey ${surveyTitle.padEnd(42)} ${linkCount} new links`);

  // ─── Points ───────────────────────────────────────────────────────────────
  // Deliberately uneven, so the leaderboard has a real shape and the dashboard
  // has a reversal to render.
  const grants: { who: number; delta: number; reason: Database["public"]["Enums"]["ledger_reason"]; note: string; days: number }[] = [
    { who: 0, delta: 210, reason: "survey_response", note: "Campus food delivery habits", days: -1 },
    { who: 0, delta: 30, reason: "instagram_task", note: "Monsoon reel — like + comment", days: -4 },
    { who: 0, delta: 100, reason: "referral", note: "App download confirmed", days: -2 },
    { who: 0, delta: -10, reason: "revoke", note: "Screenshot reused from another ambassador", days: -3 },
    { who: 0, delta: 25, reason: "manual_adjust", note: "Campus drive bonus", days: -6 },

    { who: 1, delta: 640, reason: "survey_response", note: "Campus food delivery habits", days: -2 },
    { who: 1, delta: 140, reason: "referral", note: "App downloads confirmed", days: -1 },

    { who: 2, delta: 500, reason: "survey_response", note: "Campus food delivery habits", days: -3 },
    { who: 2, delta: 115, reason: "instagram_task", note: "Founder interview clip", days: -2 },

    { who: 3, delta: 402, reason: "survey_response", note: "Campus food delivery habits", days: -5 },
    { who: 4, delta: 295, reason: "instagram_task", note: "Monsoon reel — story", days: -4 },
    { who: 5, delta: 180, reason: "referral", note: "App download confirmed", days: -7 },
  ];

  for (const [i, g] of grants.entries()) {
    // A stable source pair makes re-running the seed a no-op rather than a
    // double payout — the same guarantee the real crediting paths rely on.
    const { error } = await db.from("point_ledger").insert({
      ambassador_id: ambassadors[g.who],
      delta: g.delta,
      reason: g.reason,
      source_type: "seed",
      source_id: `seed-${i}`,
      note: g.note,
      created_by: adminId,
      created_at: at(g.days),
    });
    if (error && !error.message.includes("duplicate key")) throw error;
  }
  console.log(`  points ${String(grants.length).padEnd(42)} ledger entries`);

  // ─── Referrals ────────────────────────────────────────────────────────────
  const { data: profiles } = await db
    .from("profiles")
    .select("id, referral_code")
    .in("id", ambassadors);

  for (const p of profiles ?? []) {
    for (let n = 0; n < 3; n++) {
      await db.from("referral_conversions").upsert(
        {
          ambassador_id: p.id,
          code: p.referral_code,
          external_user_ref: `seed-app-user-${p.id.slice(0, 8)}-${n}`,
          source: "csv_import",
          status: "counted",
          converted_at: at(-n - 1),
        },
        { onConflict: "code,external_user_ref" },
      );
    }
  }
  console.log(`  refs   ${String((profiles ?? []).length * 3).padEnd(42)} conversions`);

  console.log("\nSeeded. Sign in with any of these:\n");
  for (const p of PEOPLE) {
    console.log(`  ${p.email.padEnd(28)} ${PASSWORD}   (${p.role})`);
  }
  console.log();
}

const main = process.argv.includes("--clean") ? clean : seed;

main().catch((err) => {
  console.error("\nSeed failed:", err.message ?? err);
  process.exit(1);
});
