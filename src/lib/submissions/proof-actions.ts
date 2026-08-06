
"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UploadResult } from "@/lib/submissions/actions";

/**
 * Submitting a link or a written answer.
 *
 * The screenshot path in `actions.ts` does a great deal that makes no sense
 * here — perceptual hashing, EXIF, duplicate detection, AI adjudication of an
 * image. A LinkedIn post URL has none of that to check, so this is a separate
 * action rather than a branch threaded through the other one.
 *
 * Everything without an image to inspect goes to a human. There is no
 * automatic approval here at all: the whole basis for auto-approving a
 * screenshot is that the pipeline could look at it.
 */

const MAX_TEXT = 4000;

/** Only http(s), and no credentials embedded in the URL. */
function readUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function submitProof(
  taskId: string,
  formData: FormData,
): Promise<UploadResult> {
  try {
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
      return { ok: false, message: "Only ambassadors can submit proof." };
    }
    if (profile.status !== "active") {
      return {
        ok: false,
        message: "Your account isn't active, so submissions are paused.",
      };
    }

    const db = createAdminClient();

    const { data: task } = await db
      .from("campaign_tasks")
      .select(
        "id, points, proof_type, task_library(label, proof_type), campaigns(id, status, ends_at)",
      )
      .eq("id", taskId)
      .maybeSingle();

    const campaign = task?.campaigns;
    if (!task || !campaign) {
      return { ok: false, message: "That task no longer exists." };
    }
    if (campaign.status !== "live") {
      return { ok: false, message: "This campaign isn't accepting submissions." };
    }
    if (campaign.ends_at && new Date(campaign.ends_at) < new Date()) {
      return { ok: false, message: "This campaign has ended." };
    }

    const library = task.task_library as unknown as {
      label: string;
      proof_type: string;
    } | null;
    const proofType = task.proof_type ?? library?.proof_type ?? "screenshot";

    if (proofType === "screenshot") {
      return {
        ok: false,
        message: "This task needs a screenshot — use the upload button.",
      };
    }

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
        message: "You've already submitted this one.",
      };
    }

    // ─── The proof ──────────────────────────────────────────────────────────
    let proofUrl: string | null = null;
    let proofText: string | null = null;

    if (proofType === "link") {
      const url = readUrl(String(formData.get("proof_url") ?? ""));
      if (!url) {
        return {
          ok: false,
          message: "Paste the full link, starting with https://",
        };
      }
      proofUrl = url;
    } else if (proofType === "text") {
      const text = String(formData.get("proof_text") ?? "").trim();
      if (text.length < 10) {
        return { ok: false, message: "Write a bit more than that." };
      }
      proofText = text.slice(0, MAX_TEXT);
    } else {
      // proof_type 'none' still records that they said they did it, so the
      // admin has something to approve and the points have a source row.
      proofText = "Marked as done";
    }

    const { error } = await db.from("submissions").insert({
      campaign_task_id: taskId,
      ambassador_id: user.id,
      attempt: (previous?.[0]?.attempt ?? 0) + 1,
      proof_url: proofUrl,
      proof_text: proofText,
      checks: {} as never,
      status: "needs_review",
    });
    if (error) throw error;

    revalidatePath("/dashboard/campaigns");
    revalidatePath("/admin/review");

    return {
      ok: true,
      status: "needs_review",
      message: "Sent for review. You'll hear back once it's checked.",
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Something went wrong.",
    };
  }
}
