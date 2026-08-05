"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { awardStreakBonus } from "@/lib/rewards-engine";
import { evaluateBadges } from "@/lib/badges";
import { serverEnv } from "@/lib/env";
import { notify } from "@/lib/notifications";
import type { Enums, Json } from "@/lib/database.types";

/**
 * Public survey submission.
 *
 * Respondents are anonymous strangers — friends of an ambassador — so every
 * write here uses the service-role client. That is not a shortcut: `anon` has
 * no INSERT policy on `survey_responses` at all, because a table the public can
 * write to directly is a table the public can forge points with.
 *
 * The one rule that matters: a response only earns points if it is the first
 * valid one from that person for that survey. Everything else is bookkeeping.
 */

export type SubmitState = { status: "idle" | "error" | "done"; message: string };

/** Respondent IPs are never stored raw — only a salted hash, for duplicate detection. */
async function hashIp(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip");
  if (!ip) return null;

  return createHash("sha256")
    .update(`${serverEnv().ipHashSalt}:${ip}`)
    .digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function submitSurvey(
  slug: string,
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const db = createAdminClient();

  // ─── Load the link, survey and questions ──────────────────────────────────
  const { data: link } = await db
    .from("survey_links")
    .select("id, survey_id, ambassador_id, surveys(id, title, status, points_per_response, require_email, require_phone)")
    .eq("slug", slug)
    .maybeSingle();

  const survey = link?.surveys;
  if (!link || !survey) {
    return { status: "error", message: "This link doesn't exist any more." };
  }
  if (survey.status !== "live") {
    return { status: "error", message: "This survey has closed." };
  }

  const { data: questions } = await db
    .from("survey_questions")
    .select("id, type, prompt, options, required, max_select")
    .eq("survey_id", survey.id)
    .order("order_index", { ascending: true });

  if (!questions?.length) {
    return { status: "error", message: "This survey has no questions yet." };
  }

  // ─── Respondent details ───────────────────────────────────────────────────
  const name = String(formData.get("respondent_name") ?? "").trim();
  const email = String(formData.get("respondent_email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("respondent_phone") ?? "").trim();

  if (survey.require_email && !email) {
    return { status: "error", message: "Your email is required." };
  }
  if (survey.require_phone && !phone) {
    return { status: "error", message: "Your phone number is required." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "That email doesn't look right." };
  }

  // ─── Answers ──────────────────────────────────────────────────────────────
  const answers: { question_id: string; value: Json }[] = [];

  for (const question of questions) {
    const raw = formData.getAll(`q_${question.id}`).map(String).filter((v) => v !== "");

    if (question.required && raw.length === 0) {
      return {
        status: "error",
        message: `Please answer: ${question.prompt}`,
      };
    }
    if (raw.length === 0) continue;

    // Re-checked here, not just in the browser. The form disables the extra
    // checkboxes, but a POST does not have to come from that form.
    const limit = question.max_select;
    if (limit !== null && raw.length > limit) {
      return {
        status: "error",
        message: `Pick at most ${limit} for: ${question.prompt}`,
      };
    }

    // An option called "Other" carries a typed description alongside it.
    // Stored as "Other: forestry" so a single answer stays one readable
    // string and the summary can still group every "Other" together.
    const otherText = String(formData.get(`q_${question.id}_other`) ?? "").trim();
    const withOther = (choice: string) =>
      /^other\b/i.test(choice) && otherText ? `Other: ${otherText}` : choice;

    let value: Json;
    switch (question.type as Enums<"question_type">) {
      case "multi_choice":
        value = raw.map(withOther);
        break;
      case "single_choice":
        value = withOther(raw[0]);
        break;
      case "rating":
      case "number": {
        const n = Number(raw[0]);
        if (!Number.isFinite(n)) {
          return { status: "error", message: `${question.prompt} needs a number.` };
        }
        value = n;
        break;
      }
      default:
        value = raw[0];
    }

    answers.push({ question_id: question.id, value });
  }

  // ─── Write the response ───────────────────────────────────────────────────
  const base = {
    survey_link_id: link.id,
    survey_id: survey.id,
    ambassador_id: link.ambassador_id,
    respondent_name: name || null,
    respondent_email: email || null,
    respondent_phone: phone || null,
    ip_hash: await hashIp(),
    user_agent: (await headers()).get("user-agent")?.slice(0, 500) ?? null,
  };

  let responseId: string | null = null;
  let counted = false;

  const { data: inserted, error: insertError } = await db
    .from("survey_responses")
    .insert({ ...base, status: "valid" })
    .select("id")
    .single();

  if (inserted) {
    responseId = inserted.id;
    counted = true;
  } else if (isUniqueViolation(insertError)) {
    // The partial unique indexes on (survey_id, email) and (survey_id, phone)
    // are the real duplicate check — doing it with a SELECT first would still
    // let two simultaneous submits both through. Record it, don't pay for it.
    const { data: duplicate } = await db
      .from("survey_responses")
      .insert({
        ...base,
        status: "duplicate",
        flag_reason: "Already responded to this survey",
      })
      .select("id")
      .single();
    responseId = duplicate?.id ?? null;
  } else if (insertError) {
    return {
      status: "error",
      message: "Something went wrong saving your answers. Try again.",
    };
  }

  if (!responseId) {
    return { status: "error", message: "Couldn't save your answers. Try again." };
  }

  // A survey response also makes the week active, so the consistency bonus
  // is checked here too rather than only on campaign approvals.
  await awardStreakBonus(link.ambassador_id, null).catch(() => {});
  await evaluateBadges(link.ambassador_id).catch(() => {});

  await db.from("survey_answers").insert(
    answers.map((a) => ({ ...a, response_id: responseId! })),
  );

  // ─── Credit the ambassador ────────────────────────────────────────────────
  if (counted && survey.points_per_response > 0) {
    const { error: ledgerError } = await db.from("point_ledger").insert({
      ambassador_id: link.ambassador_id,
      delta: survey.points_per_response,
      reason: "survey_response",
      source_type: "survey_response",
      source_id: responseId,
      note: survey.title,
    });

    // A duplicate here means the credit already landed — nothing to fix.
    if (!ledgerError) {
      await notify({
        profileId: link.ambassador_id,
        type: "points_awarded",
        title: `+${survey.points_per_response} points from a survey response`,
        body: survey.title,
        href: "/dashboard/surveys",
        meta: { surveyId: survey.id, responseId },
      }).catch(() => {});
    }
  }

  return {
    status: "done",
    message: counted
      ? "Thanks — your answers are in."
      : "Looks like you've already filled this in. Thanks anyway!",
  };
}
