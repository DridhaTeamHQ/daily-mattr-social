import "server-only";

import OpenAI from "openai";

/**
 * AI assistance for the admin screens.
 *
 * Strictly a drafting aid: it proposes survey questions and campaign copy that
 * an admin then edits and accepts. Nothing it returns is written anywhere
 * without a human pressing a button, and nothing it returns is executed.
 *
 * Absent an API key every helper reports itself unavailable and the UI hides
 * the buttons, rather than offering something that will fail.
 */

export function aiEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function client(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function textModel(): string {
  return process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
}

/**
 * Deliberately NOT the same tier as the text model.
 *
 * Judging a screenshot means reading an 11px handle and telling a filled heart
 * from an outlined one inside a full desktop screen. gpt-4o-mini cannot do it:
 * on a real 1910×1045 browser screenshot of @dailymattr it reported the handle
 * as "diyash", then — once told not to guess — said the handle was unreadable
 * while still concluding the post wasn't @dailymattr. Both times: matches
 * false, confidence 0.9. Confidently wrong, which is the worst failure mode
 * here, because it sends a student's genuine work to the reject pile.
 *
 * Same image, same prompt, gpt-4.1-mini reads "dailymattr" and returns true at
 * 0.95. It costs about the same. The cheaper model was not a saving, it was a
 * defect.
 */
export function visionModel(): string {
  return process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
}

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * Shared JSON-schema call.
 *
 * `strict: true` makes the model's output conform to the schema, which is the
 * difference between parsing a response and hoping about one.
 */
async function askForJson<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
  schemaName: string,
): Promise<AiResult<T>> {
  if (!aiEnabled()) {
    return { ok: false, message: "AI suggestions aren't configured." };
  }

  try {
    const completion = await client().chat.completions.create({
      model: textModel(),
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { ok: false, message: "The model returned nothing." };

    return { ok: true, data: JSON.parse(raw) as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return { ok: false, message };
  }
}

// ─── Survey questions ───────────────────────────────────────────────────────

export type SuggestedQuestion = {
  type:
    | "short_text"
    | "long_text"
    | "single_choice"
    | "multi_choice"
    | "rating"
    | "number"
    | "email"
    | "phone";
  prompt: string;
  help_text: string;
  options: string[];
  required: boolean;
};

export type SuggestedSurvey = {
  title: string;
  description: string;
  questions: SuggestedQuestion[];
};

const SURVEY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "questions"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "prompt", "help_text", "options", "required"],
        properties: {
          type: {
            type: "string",
            enum: [
              "short_text",
              "long_text",
              "single_choice",
              "multi_choice",
              "rating",
              "number",
              "email",
              "phone",
            ],
          },
          prompt: { type: "string" },
          help_text: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          required: { type: "boolean" },
        },
      },
    },
  },
} as const;

export async function suggestSurvey(
  topic: string,
  count: number,
): Promise<AiResult<SuggestedSurvey>> {
  const system = [
    "You design short surveys that Indian college students will actually finish on a phone.",
    "Rules:",
    "- Between 3 and 8 questions. Shorter is better; every extra question loses respondents.",
    "- Lead with the easy, concrete questions. Never open with a free-text question.",
    "- Prefer single_choice and multi_choice. Use long_text at most once, and only near the end.",
    "- single_choice and multi_choice MUST have between 3 and 6 options, and the options must be mutually distinct.",
    "- rating means 1-5. Use it at most once.",
    "- Every other type takes an empty options array.",
    "- Write like a person, not a market research firm. No 'kindly', no 'please indicate'.",
    "- Never ask for name, email or phone as a question — the form collects those separately.",
    "- help_text is usually an empty string. Only use it when a question is genuinely ambiguous.",
  ].join("\n");

  const user = `Design a survey with about ${count} questions on this topic:\n\n${topic}`;

  return askForJson<SuggestedSurvey>(system, user, SURVEY_SCHEMA, "survey");
}

// ─── Campaign copy ──────────────────────────────────────────────────────────

export type SuggestedCampaign = {
  title: string;
  description: string;
  caption_hint: string;
  comment_ideas: string[];
  points: { like: number; comment: number; share: number; story: number };
};

const CAMPAIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "caption_hint", "comment_ideas", "points"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    caption_hint: { type: "string" },
    comment_ideas: { type: "array", items: { type: "string" } },
    points: {
      type: "object",
      additionalProperties: false,
      required: ["like", "comment", "share", "story"],
      properties: {
        like: { type: "integer" },
        comment: { type: "integer" },
        share: { type: "integer" },
        story: { type: "integer" },
      },
    },
  },
} as const;

export async function suggestCampaign(
  brief: string,
): Promise<AiResult<SuggestedCampaign>> {
  const system = [
    "You brief student ambassadors on Instagram tasks for DailyMattr, a daily news app for Indian college students.",
    "Rules:",
    "- title: under 60 characters, concrete, no marketing adjectives.",
    "- description: two sentences at most, addressed to the student, saying exactly what to do.",
    "- caption_hint: a couple of words that should appear in the post's caption, used to check screenshots. Lowercase.",
    "- comment_ideas: 3 to 5 example comments a student could adapt. They must sound like a real 20-year-old, not a brand. No hashtags, no emoji spam.",
    "- points: effort-weighted. A like is trivial (5-10). A comment takes thought (15-25). A share is 10-20. A story costs social capital, so it's worth most (25-40).",
    "- Never suggest buying engagement, fake accounts, or anything that breaks Instagram's terms.",
  ].join("\n");

  return askForJson<SuggestedCampaign>(
    system,
    `Write a campaign brief for:\n\n${brief}`,
    CAMPAIGN_SCHEMA,
    "campaign",
  );
}

// ─── Screenshot adjudication ────────────────────────────────────────────────

export type ScreenshotVerdict = {
  /** Does the image show this task done, on this account? */
  matches: boolean;
  /** 0-1. Only high values auto-approve; the threshold is an admin setting. */
  confidence: number;
  /** One line, written for an admin reading the review queue. */
  reason: string;
  /** What the model could actually read, for the reviewer to sanity-check. */
  handle_seen: string;
};

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["matches", "confidence", "reason", "handle_seen"],
  properties: {
    matches: { type: "boolean" },
    confidence: { type: "number" },
    reason: { type: "string" },
    handle_seen: { type: "string" },
  },
} as const;

const TASK_EVIDENCE: Record<string, string> = {
  like: "the like/heart control is in its filled, active state",
  comment: "a comment written by this user is visible on the post",
  share: "a share or send action to at least one recipient is visible",
  story: "the post has been added to the user's own story",
};

/**
 * Asks a vision model whether a screenshot shows a task completed.
 *
 * The prompt pushes hard toward `matches: false` on ambiguity, because the two
 * errors are not symmetric: a false negative sends a genuine submission to a
 * human who approves it in seconds, while a false positive silently pays out
 * for a fake and teaches the cohort that fakes work.
 */
export async function adjudicateScreenshot(input: {
  imageDataUrl: string;
  taskType: string;
  /** The human name of the task, when there is one. Sharpens the prompt. */
  taskLabel?: string | null;
  expectedHandle: string;
  captionHint: string | null;
}): Promise<AiResult<ScreenshotVerdict>> {
  if (!aiEnabled()) {
    return { ok: false, message: "AI verification isn't configured." };
  }

  const evidence =
    TASK_EVIDENCE[input.taskType] ?? "the described action has been performed";

  const system = [
    "You verify Instagram screenshots submitted by student ambassadors, one image at a time.",
    "",
    "WORK THROUGH IT IN THIS ORDER, and put each answer in the reason:",
    "1. What is in the image? An Instagram post, a profile, a story, a DM, or something else entirely.",
    `2. Which account posted it? Read the handle character by character. The expected handle is "${input.expectedHandle}".`,
    `3. Is the required action visibly done? Required: ${evidence}`,
    "4. Is the image an untouched screenshot, or a camera photo of another screen, or edited?",
    "",
    "Only then decide. matches: true requires yes to steps 2, 3 and 4 together.",
    "",
    "READING THE HANDLE",
    "Handles render small, especially on a desktop screenshot where the post is a narrow column in a wide window. Look at the header above the post and at the caption's first word — the same handle usually appears twice, which lets you check one reading against the other.",
    "Common misreads: rn looks like m, l looks like I, 0 looks like o. If your reading differs from the expected handle by one or two characters of that kind, look again before concluding they are different accounts.",
    "If you genuinely cannot read it, say so, leave handle_seen empty and set confidence at or below 0.5. NEVER state a guessed handle as fact — a confident misread is the single worst thing you can do here, because it rejects real work.",
    "",
    "WHAT IS NOT A PROBLEM",
    "A desktop browser screenshot is completely valid evidence. Landscape orientation, browser chrome, tabs, a sidebar, a taskbar, dark mode, a notification banner, or the post occupying only part of a wide screen are all normal. Judge the Instagram content, never the device it was viewed on.",
    "Cropping is normal too. A cropped screenshot that still shows the handle and the action is fine.",
    "",
    "WHAT IS A PROBLEM",
    "A clearly different account, the action visibly not done, a photograph of another screen, or visible editing of counts or controls.",
    "",
    "CALIBRATION",
    "Everything you decline goes to a human, so a wrong 'no' costs a few seconds of review. A wrong 'yes' pays a fake. Be strict — but 'strict' means answering false when the evidence is genuinely against it, NOT when you simply could not see well enough. When you could not see well enough, say exactly that and use a low confidence.",
    "confidence is your certainty in the answer you gave, from 0 to 1.",
    "handle_seen is the handle you could actually read, or an empty string if none was legible.",
  ].join("\n");

  try {
    const completion = await client().chat.completions.create({
      model: visionModel(),
      temperature: 0,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Task being claimed: ${input.taskLabel ?? input.taskType}.`,
                `Expected account: @${input.expectedHandle}.`,
                input.captionHint
                  ? `The caption should mention: ${input.captionHint}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              type: "image_url",
              // High detail, deliberately. The entire task is reading a small
              // handle and a small like control; "low" downsamples to ~512px,
              // which on a desktop screenshot makes both illegible and
              // produces confident nonsense like a misread handle.
              image_url: { url: input.imageDataUrl, detail: "high" },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "verdict", strict: true, schema: VERDICT_SCHEMA },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { ok: false, message: "The model returned nothing." };

    const parsed = JSON.parse(raw) as ScreenshotVerdict;
    // Clamp: a model returning 1.4 must not sail past the approval threshold.
    parsed.confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));

    return { ok: true, data: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return { ok: false, message };
  }
}

// ─── One question, rewritten ────────────────────────────────────────────────

export type PolishedQuestion = {
  prompt: string;
  help_text: string;
  options: string[];
};

const POLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "help_text", "options"],
  properties: {
    prompt: { type: "string" },
    help_text: { type: "string" },
    options: { type: "array", items: { type: "string" } },
  },
} as const;

/**
 * Rewrites a question that already exists, rather than inventing one.
 *
 * The distinction matters: an admin pressing this has decided what to ask and
 * wants it said better. A model that "improves" a question into a different
 * question produces a survey nobody meant to run, and — once answers exist —
 * one whose stored responses no longer match what is on screen.
 *
 * `lockOptions` is passed once a survey has been answered. The options are
 * then returned untouched, because an answer is stored as the option's own
 * text and rewording a choice would orphan every response that picked it.
 */
export async function polishQuestion(input: {
  prompt: string;
  helpText: string;
  options: string[];
  type: string;
  lockOptions: boolean;
}): Promise<AiResult<PolishedQuestion>> {
  const system = [
    "You edit survey questions for Indian college students answering on a phone.",
    "You are rewriting ONE existing question. Keep what it asks identical — change only how it reads.",
    "Rules:",
    "- Keep the same meaning. Never broaden, narrow, or split the question.",
    "- Plain, direct, friendly. No 'kindly', no 'please indicate', no market-research voice.",
    "- Keep it short enough to read at a glance on a phone.",
    "- help_text is usually an empty string. Add one short line only if the question is genuinely ambiguous without it.",
    input.lockOptions
      ? "- Return the options EXACTLY as given, unchanged, in the same order."
      : "- Options: keep the same choices and the same order, tightened only for wording. Never add or remove one.",
  ].join("\n");

  const user = [
    `Type: ${input.type}`,
    `Question: ${input.prompt}`,
    `Help text: ${input.helpText || "(none)"}`,
    input.options.length
      ? `Options:\n${input.options.map((o) => `- ${o}`).join("\n")}`
      : "Options: (none)",
  ].join("\n");

  const result = await askForJson<PolishedQuestion>(
    system,
    user,
    POLISH_SCHEMA,
    "question",
  );

  // The prompt asks for the options back untouched; this makes it true even if
  // the model ignores that, because the alternative is silently orphaning
  // answers that were stored as the old wording.
  if (result.ok && input.lockOptions) {
    return { ...result, data: { ...result.data, options: input.options } };
  }
  return result;
}
