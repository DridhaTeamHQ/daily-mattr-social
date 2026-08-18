"use server";

import { createClient } from "@/lib/supabase/server";
import {
  aiEnabled,
  polishQuestion,
  suggestCampaign,
  suggestSurvey,
  type AiResult,
  type PolishedQuestion,
  type SuggestedCampaign,
  type SuggestedSurvey,
} from "@/lib/ai";

/**
 * Admin-only wrappers around the AI helpers.
 *
 * These spend money per call, so they are gated on the same admin check as
 * every other admin action rather than being left open to any signed-in user.
 */

async function assertAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.status !== "active") {
    throw new Error("Not authorised");
  }
}

export async function isAiEnabled(): Promise<boolean> {
  return aiEnabled();
}

export async function draftSurvey(
  topic: string,
  count: number,
): Promise<AiResult<SuggestedSurvey>> {
  try {
    await assertAdmin();

    if (!topic.trim()) {
      return { ok: false, message: "Describe what you want to ask about." };
    }

    return await suggestSurvey(
      topic.trim().slice(0, 2000),
      Math.min(8, Math.max(3, count)),
    );
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Couldn't draft that.",
    };
  }
}

export async function draftCampaign(
  brief: string,
): Promise<AiResult<SuggestedCampaign>> {
  try {
    await assertAdmin();

    if (!brief.trim()) {
      return { ok: false, message: "Describe the post or the goal." };
    }

    return await suggestCampaign(brief.trim().slice(0, 2000));
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Couldn't draft that.",
    };
  }
}

/**
 * Rewrites one existing survey question.
 *
 * Nothing is saved here — the polished wording goes back into the form for an
 * admin to read, change or discard. The model suggests; the person decides.
 */
export async function polishSurveyQuestion(input: {
  prompt: string;
  helpText: string;
  options: string[];
  type: string;
  lockOptions: boolean;
}): Promise<AiResult<PolishedQuestion>> {
  try {
    await assertAdmin();

    if (!input.prompt.trim()) {
      return { ok: false, message: "Write the question first, then polish it." };
    }

    return await polishQuestion({
      prompt: input.prompt.trim().slice(0, 500),
      helpText: input.helpText.trim().slice(0, 500),
      options: input.options.slice(0, 12).map((o) => o.slice(0, 200)),
      type: input.type,
      lockOptions: input.lockOptions,
    });
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Couldn't rewrite that.",
    };
  }
}
