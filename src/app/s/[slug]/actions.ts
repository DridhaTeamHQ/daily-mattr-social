"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { clientIp } from "@/lib/client-ip";
import { createAdminClient } from "@/lib/supabase/admin";
// The signed-in session, used only to prove a participant survey is being
// answered by the ambassador it was issued to.
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { awardStreakBonus } from "@/lib/rewards-engine";
import { evaluateBadges } from "@/lib/badges";
import { serverEnv } from "@/lib/env";
import { notify } from "@/lib/notifications";
import { isOtherOption } from "@/lib/survey-other";
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

export type SubmitState = {
  status: "idle" | "error" | "done" | "already";
  message: string;
};

/** Shown whenever the same email (or phone) comes back to the same survey. */
const ALREADY_SUBMITTED: SubmitState = {
  status: "already",
  message: "You've already submitted this survey.",
};

/** Respondent IPs are never stored raw — only a salted hash, for duplicate detection. */
async function hashIp(): Promise<string | null> {
  // `clientIp` rather than the leftmost `x-forwarded-for`: that entry is the
  // one the client writes, and the duplicate window below is the only thing
  // standing between a public link and unlimited self-issued points on a survey
  // that asks for neither an email nor a phone number. A rotating header would
  // have given every submission a fresh identity and the window would never
  // have fired.
  const ip = clientIp(await headers());
  if (!ip) return null;

  return createHash("sha256")
    .update(`${serverEnv().ipHashSalt}:${ip}`)
    .digest("hex");
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
    .select("id, survey_id, ambassador_id, surveys(id, title, status, points_per_response, require_email, require_phone, response_cap, audience)")
    .eq("slug", slug)
    .maybeSingle();

  const survey = link?.surveys;
  if (!link || !survey) {
    return { status: "error", message: "This link doesn't exist any more." };
  }
  if (survey.status !== "live") {
    return { status: "error", message: "This survey has closed." };
  }

  /**
   * A participant survey is the ambassador answering for themselves.
   *
   * Checked against the signed-in account rather than anything in the form: a
   * link that has been forwarded, screenshotted or guessed still cannot be
   * answered by whoever holds it, which is the whole point of the setting.
   */
  let participantUserId: string | null = null;

  if (survey.audience === "participant") {
    const sessionClient = await createSessionClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();

    if (!user) {
      return {
        status: "error",
        message: "Sign in to your ambassador account to answer this one.",
      };
    }
    if (user.id !== link.ambassador_id) {
      return {
        status: "error",
        message: "This survey is only for the ambassador it was issued to.",
      };
    }

    participantUserId = user.id;
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

    // An option called "Other" — or "Others" — carries a typed description
    // alongside it. Stored as "Other: forestry" so a single answer stays one
    // readable string and the summary can still group every "Other" together.
    // The same matcher the form used to decide whether to show the box, so a
    // respondent can never type into a field the server then ignores.
    const otherText = String(formData.get(`q_${question.id}_other`) ?? "").trim();
    const withOther = (choice: string) =>
      isOtherOption(choice) && otherText ? `Other: ${otherText}` : choice;

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
    respondent_name: name || null,
    respondent_email: email || null,
    respondent_phone: phone || null,
    ip_hash: await hashIp(),
    user_agent: (await headers()).get("user-agent")?.slice(0, 500) ?? null,
  };

  /**
   * Admission and insertion are deliberately one database operation.
   *
   * A check followed by a later INSERT is unsafe in production: two Server
   * Action instances can both observe the old count. The RPC holds the survey
   * row lock while it checks participant uniqueness, the public cap and the IP
   * window, inserts the response, and closes a newly-full survey.
   */
  const IP_WINDOW_MINUTES = 30;
  const { data: admission, error: admissionError } = await db
    .rpc("submit_survey_response_atomic", {
      p_survey_link_id: link.id,
      p_participant_user_id: participantUserId,
      p_respondent_name: base.respondent_name,
      p_respondent_email: base.respondent_email,
      p_respondent_phone: base.respondent_phone,
      p_ip_hash: base.ip_hash,
      p_user_agent: base.user_agent,
      p_ip_window_minutes: IP_WINDOW_MINUTES,
    })
    .single();

  if (admissionError || !admission) {
    console.error("atomic survey admission failed", {
      surveyId: survey.id,
      code: admissionError?.code,
    });
    return {
      status: "error",
      message: "Something went wrong saving your answers. Try again.",
    };
  }

  switch (admission.outcome) {
    case "not_found":
      return { status: "error", message: "This link doesn't exist any more." };
    case "closed":
      return { status: "error", message: "This survey has closed." };
    case "participant_forbidden":
      return {
        status: "error",
        message: "This survey is only for the ambassador it was issued to.",
      };
    case "participant_duplicate":
      return {
        status: "error",
        message: "You've already answered this one. Thanks!",
      };
    case "cap_reached":
      return {
        status: "error",
        message: "This survey has all the responses it needs. Thanks anyway!",
      };
    case "identity_duplicate":
      return ALREADY_SUBMITTED;
    case "ip_duplicate":
      return {
        status: "done",
        message: "Thanks — your answers were recorded.",
      };
    case "accepted":
      break;
    default:
      console.error("unexpected atomic survey admission outcome", {
        surveyId: survey.id,
        outcome: admission.outcome,
      });
      return {
        status: "error",
        message: "Something went wrong saving your answers. Try again.",
      };
  }

  const responseId = admission.response_id;
  if (!responseId) {
    return { status: "error", message: "Couldn't save your answers. Try again." };
  }

  // A survey response also makes the week active, so the consistency bonus
  // is checked here too rather than only on campaign approvals.
  await awardStreakBonus(link.ambassador_id, null).catch(() => {});
  await evaluateBadges(link.ambassador_id).catch(() => {});

  // Checked, because a response with no answers is worse than no response: it
  // counts towards the cap, it counts towards the ambassador's total, and it
  // pays a point for a row the admin's summary cannot read anything out of.
  const { error: answersError } = await db.from("survey_answers").insert(
    answers.map((a) => ({ ...a, response_id: responseId! })),
  );

  if (answersError) {
    await db
      .from("survey_responses")
      .update({
        status: "flagged",
        flag_reason: "Answers failed to save",
      })
      .eq("id", responseId);

    return {
      status: "error",
      message: "Something went wrong saving your answers. Try again.",
    };
  }

  // ─── Credit the ambassador ────────────────────────────────────────────────
  if (survey.points_per_response > 0) {
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

  /**
   * The IP-window outcome still answers with this sentence rather than
   * "already submitted": it is a coarse signal — a lecture hall behind one NAT
   * shares an address — and telling a stranger they had already responded when
   * they had not would be wrong. Only a matching email or phone, which is the
   * person identifying themselves, gets the "already submitted" answer.
   *
   * That answer is a yes/no on whether a given address has responded, to anyone
   * holding the link. It is a deliberate trade: a duplicate that reads as a
   * successful submission is worse, because the respondent walks away believing
   * their answers were counted when they were not.
   */
  return {
    status: "done",
    message: "Thanks — your answers were recorded.",
  };
}
