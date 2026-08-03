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
