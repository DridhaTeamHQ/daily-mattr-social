"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adjudicateScreenshot, aiEnabled } from "@/lib/ai";
import { readImageFacts } from "@/lib/images";
import { notify } from "@/lib/notifications";
import { decide, runChecks } from "@/lib/submissions/checks";
import type { Json } from "@/lib/database.types";

/**
 * Screenshot upload.
 *
 * The whole pipeline lives here: validate, fingerprint, check for reuse,
 * store, adjudicate, decide, credit. Everything after validation runs with the
 * service-role client, because `submissions` has no INSERT policy for
 * `authenticated` by design — letting the client insert would let it choose
 * its own `status`, which is the same as letting it pay itself.
 */

export type UploadResult = {
  ok: boolean;
  message: string;
  status?: string;
};

const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's own limit
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/** Numeric settings, with the defaults from migration 0001 as a fallback. */
async function settings() {
  const { data } = await createAdminClient()
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "ai.enabled",
      "ai.auto_approve_min",
      "submissions.max_attempts",
      "phash.reject_distance",
    ]);

  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const raw = map.get(key);
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    aiOn: map.get("ai.enabled") !== false,
    autoApproveMin: num("ai.auto_approve_min", 0.85),
    maxAttempts: num("submissions.max_attempts", 3),
    rejectDistance: num("phash.reject_distance", 6),
  };
}

export async function uploadSubmission(
  taskId: string,
  formData: FormData,
): Promise<UploadResult> {
  try {
    // ─── Who ────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "Please sign in again." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "ambassador") {
      return { ok: false, message: "Only ambassadors can upload screenshots." };
    }
    if (profile.status !== "active") {
      return {
        ok: false,
        message: "Your account isn't active, so uploads are paused.",
      };
    }

    // ─── What ───────────────────────────────────────────────────────────────
    const file = formData.get("screenshot");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Pick a screenshot first." };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, message: "That image is over 10MB. Try a screenshot rather than a photo." };
    }
    if (!ALLOWED.has(file.type)) {
      return { ok: false, message: "That file isn't an image we can read." };
    }

    const db = createAdminClient();

    // The task, its campaign, and whether the campaign is still open.
    const { data: task } = await db
      .from("campaign_tasks")
      .select("id, type, points, campaigns(id, title, status, ends_at, expected_handle, caption_hint)")
      .eq("id", taskId)
      .maybeSingle();

    const campaign = task?.campaigns;
    if (!task || !campaign) {
      return { ok: false, message: "That task no longer exists." };
    }
    if (campaign.status !== "live") {
      return { ok: false, message: "This campaign isn't accepting uploads." };
    }
    if (campaign.ends_at && new Date(campaign.ends_at) < new Date()) {
      return { ok: false, message: "This campaign has ended." };
    }

    const config = await settings();

    // ─── Attempts ───────────────────────────────────────────────────────────
    const { data: previous } = await db
      .from("submissions")
      .select("id, status, attempt")
      .eq("campaign_task_id", taskId)
      .eq("ambassador_id", user.id)
      .order("attempt", { ascending: false });

    const live = (previous ?? []).find(
      (s) => s.status !== "rejected" && s.status !== "revoked",
    );
    if (live) {
      return {
        ok: false,
        message: "You've already submitted this one. Check its status above.",
      };
    }

    const attempt = (previous?.[0]?.attempt ?? 0) + 1;
    if (attempt > config.maxAttempts) {
      return {
        ok: false,
        message: `You've used all ${config.maxAttempts} attempts on this task. Ask an admin to take a look.`,
      };
    }

    // ─── Fingerprint ────────────────────────────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    const facts = await readImageFacts(buffer);

    const { data: exact } = await db
      .from("submissions")
      .select("id")
      .eq("sha256", facts.sha256)
      .limit(1);

    // The perceptual check is the one that actually catches fraud: an image
    // passed around a group chat is recompressed, so every byte differs while
    // the picture is identical.
    const { data: similar } = await db.rpc("find_similar_submissions", {
      probe: facts.phash,
      max_distance: config.rejectDistance,
    });

    const fromOthers = (similar ?? []).filter(
      (s) => s.ambassador_id !== user.id,
    );
    const nearest = fromOthers.length
      ? Math.min(...fromOthers.map((s) => s.distance))
      : null;

    const checks = runChecks(
      {
        width: facts.width,
        height: facts.height,
        byteSize: facts.byteSize,
        mimeType: facts.mimeType,
        capturedAt: facts.capturedAt,
      },
      {
        exactMatch: Boolean(exact?.length),
        nearestDistance: nearest,
        rejectDistance: config.rejectDistance,
      },
    );

    // ─── Store ──────────────────────────────────────────────────────────────
    // Key shape is `<ambassador>/<task>/<uuid>.<ext>`, which is what the
    // storage policy uses to decide who may read it.
    const ext = (facts.mimeType.split("/")[1] || "png").replace("jpeg", "jpg");
    const path = `${user.id}/${taskId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await db.storage
      .from("screenshots")
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      return { ok: false, message: `Couldn't save the image: ${uploadError.message}` };
    }

    // ─── Adjudicate ─────────────────────────────────────────────────────────
    let verdict: { matches: boolean; confidence: number } | null = null;
    let aiVerdictRaw: Json | null = null;
    let aiModel: string | null = null;

    // Only the four Instagram enum actions are adjudicated. The prompt asks
    // about an Instagram handle and a filled like control, so pointing it at a
    // Snapchat story or a Reddit screenshot would confidently reject real
    // work — the exact failure mode that sent a genuine upload to review
    // before. Library tasks go straight to a human instead.
    if (config.aiOn && aiEnabled() && task.type) {
      const result = await adjudicateScreenshot({
        imageDataUrl: `data:${file.type};base64,${buffer.toString("base64")}`,
        taskType: task.type,
        expectedHandle: campaign.expected_handle,
        captionHint: campaign.caption_hint,
      });

      if (result.ok) {
        verdict = { matches: result.data.matches, confidence: result.data.confidence };
        aiVerdictRaw = result.data as unknown as Json;
        aiModel = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
      }
      // A failed AI call is not a failed upload — it just means a human looks.
    }

    const decision = decide(checks, verdict, config.autoApproveMin);

    // ─── Record ─────────────────────────────────────────────────────────────
    const { data: submission, error: insertError } = await db
      .from("submissions")
      .insert({
        campaign_task_id: taskId,
        ambassador_id: user.id,
        attempt,
        screenshot_path: path,
        sha256: facts.sha256,
        phash: facts.phash,
        width: facts.width,
        height: facts.height,
        byte_size: facts.byteSize,
        mime_type: facts.mimeType,
        captured_at: facts.capturedAt,
        checks: checks as unknown as Json,
        ai_verdict: aiVerdictRaw,
        ai_confidence: verdict?.confidence ?? null,
        ai_model: aiModel,
        status: decision.status,
      })
      .select("id")
      .single();

    if (insertError || !submission) {
      // Don't leave an orphan in the bucket that no row points at.
      await db.storage.from("screenshots").remove([path]);
      return { ok: false, message: "Couldn't record that upload. Try again." };
    }

    // ─── Pay ────────────────────────────────────────────────────────────────
    if (decision.status === "auto_approved" && task.points > 0) {
      // Same idempotent source pair the review queue uses, so a retry or a
      // later manual approval can never pay twice.
      const { error: ledgerError } = await db.from("point_ledger").insert({
        ambassador_id: user.id,
        delta: task.points,
        reason: "instagram_task",
        source_type: "submission",
        source_id: submission.id,
        note: campaign.title,
      });

      if (!ledgerError) {
        await notify({
          profileId: user.id,
          type: "submission_approved",
          title: `Approved — you earned ${task.points} points`,
          body: campaign.title,
          href: "/dashboard/campaigns",
          meta: { submissionId: submission.id, auto: true },
        }).catch(() => {});
      }
    }

    revalidatePath("/dashboard/campaigns");
    revalidatePath("/dashboard");

    return {
      ok: true,
      status: decision.status,
      message:
        decision.status === "auto_approved"
          ? `Approved — ${task.points} points added.`
          : "Uploaded. We'll check it and let you know.",
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Something went wrong uploading.";
    return { ok: false, message };
  }
}
