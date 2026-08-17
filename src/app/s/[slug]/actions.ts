"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { clientIp } from "@/lib/client-ip";
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
    .select("id, survey_id, ambassador_id, surveys(id, title, status, points_per_response, require_email, require_phone, response_cap)")
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
   * The cap an admin set is now actually a cap.
   *
   * `surveys.response_cap` was collected in the builder and shown as a limit
   * and never read by anything. An admin who capped a survey at 200 got as
   * many as arrived.
   */
  if (survey.response_cap && survey.response_cap > 0) {
    const { count } = await db
      .from("survey_responses")
      .select("id", { count: "exact", head: true })
      .eq("survey_id", survey.id)
      .eq("status", "valid");

    if ((count ?? 0) >= survey.response_cap) {
      return {
        status: "error",
        message: "This survey has all the responses it needs. Thanks anyway!",
      };
    }
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

  /**
   * Someone coming back a second time is told so, and nothing is written.
   *
   * This used to record a `duplicate` row and thank them as if it had landed.
   * That row is what surfaces on the ambassador's dashboard as "flagged for
   * review", so an honest second visit read as something an admin had to go and
   * clear. A repeat submission is not a moderation problem — it is a person who
   * already filled the form in — so it is now refused at the door and leaves no
   * trace to clear.
   *
   * The unique-violation branch further down stays as the real guarantee: this
   * SELECT loses a race between two simultaneous submits, the index does not.
   */
  const identities: [column: "respondent_email" | "respondent_phone", value: string][] = [];
  if (email) identities.push(["respondent_email", email]);
  if (phone) identities.push(["respondent_phone", phone]);

  for (const [column, value] of identities) {
    const { count } = await db
      .from("survey_responses")
      .select("id", { count: "exact", head: true })
      .eq("survey_id", survey.id)
      .eq(column, value)
      .eq("status", "valid");

    if ((count ?? 0) > 0) return ALREADY_SUBMITTED;
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

  /**
   * A duplicate check that does not depend on the respondent volunteering PII.
   *
   * The two partial unique indexes only bite when an email or a phone is
   * present — `where status = 'valid' and respondent_email is not null`. Both
   * fields are per-survey optional, and on a survey with both switched off
   * nothing was unique about a second submission: every reload wrote a fresh
   * valid row and credited the ambassador again. One public URL, no account, a
   * loop, unlimited points — and points become stipend, which becomes cash.
   *
   * `ip_hash` was already being computed, stored and indexed. It was simply
   * never read. It is a coarse signal — a lecture hall behind one NAT shares an
   * address — so it is a window rather than a hard unique constraint: a second
   * submission from the same address to the same survey inside the window is
   * recorded but not paid for. That is the same treatment a duplicate email
   * gets, and it keeps an honest second respondent's answers while refusing to
   * mint a second point for them.
   */
  const IP_WINDOW_MINUTES = 30;
  let ipRepeat = false;

  if (base.ip_hash) {
    const since = new Date(
      Date.now() - IP_WINDOW_MINUTES * 60_000,
    ).toISOString();

    const { count } = await db
      .from("survey_responses")
      .select("id", { count: "exact", head: true })
      .eq("survey_id", survey.id)
      .eq("ip_hash", base.ip_hash)
      .eq("status", "valid")
      .gte("submitted_at", since);

    ipRepeat = (count ?? 0) > 0;
  }

  let responseId: string | null = null;
  let counted = false;

  if (ipRepeat) {
    // Kept, flagged, and not paid for.
    const { data: repeat } = await db
      .from("survey_responses")
      .insert({
        ...base,
        status: "duplicate",
        flag_reason: `Another response came from the same network within ${IP_WINDOW_MINUTES} minutes`,
      })
      .select("id")
      .single();

    // Returned whether or not the row landed. It used to fall through to the
    // `valid` insert when the flagged one failed, which turned a refused
    // submission into a paid one — the single case this branch exists to
    // prevent. Losing the flagged row is a gap in the audit trail; crediting it
    // is a gap in the money.
    //
    // The respondent is told the same thing either way. Whether their answer
    // earned the ambassador a point is not their business, and saying so would
    // teach anyone farming the link exactly where the line is.
    if (!repeat) {
      console.error("survey duplicate row failed to record", {
        surveyId: survey.id,
      });
    }

    return {
      status: "done",
      message: "Thanks — your answers were recorded.",
    };
  }

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
    // are the real duplicate check — the SELECT above can be lost by two
    // simultaneous submits, this cannot. Same answer either way: refused, and
    // nothing recorded for an admin to clear.
    return ALREADY_SUBMITTED;
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

  /**
   * The IP-window branch above still answers with this sentence rather than
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
