"use server";

import { randomUUID } from "node:crypto";

import { assertAdminWrite, fail } from "@/lib/admin/guards";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Putting a picture into a survey.
 *
 * The file goes into `campaign-media`, the bucket that already exists for our
 * own artwork: public, 5 MB, png/jpeg/webp, admin-write. A survey image has
 * exactly those requirements — it is shown to a stranger with no account, so
 * it cannot sit behind a signed URL, and only an admin building the survey
 * ever writes one.
 *
 * ─── Why the upload is a server action and not a direct client upload ──────
 *
 * The bucket's RLS policy would allow an admin's browser to write to it
 * directly, which would be one less round trip. It is done here anyway,
 * because the checks below are the whole of the validation: a browser that
 * uploads on its own decides its own content type, and the storage API
 * believes it. Everything that reaches the bucket has been through this
 * function, which is the same rule the screenshot pipeline follows for the
 * same reason.
 */

/** Matches the bucket's own limit, so a refusal is ours and readable. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * What the bucket accepts. Checked here as well as there so the admin is told
 * "PNG, JPEG or WebP" rather than handed a storage error about mime types.
 */
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

export async function uploadSurveyImage(
  formData: FormData,
): Promise<UploadResult> {
  try {
    await assertAdminWrite();

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Choose an image first." };
    }

    const extension = ALLOWED[file.type];
    if (!extension) {
      return {
        ok: false,
        message: "That has to be a PNG, JPEG or WebP image.",
      };
    }

    if (file.size > MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      return {
        ok: false,
        message: `That image is ${mb} MB. The limit is 5 MB — resize it and try again.`,
      };
    }

    /**
     * A random name, not the one the file arrived with.
     *
     * An admin's filename is not a secret but it is not ours to publish
     * either, and this bucket is world-readable: "internal-draft-final-2.png"
     * sitting on a public URL is an avoidable leak of nothing important. A
     * uuid also sidesteps every collision and every character a storage key
     * would rather not carry.
     */
    const key = `surveys/${randomUUID()}.${extension}`;

    const db = createAdminClient();
    const { error } = await db.storage
      .from("campaign-media")
      .upload(key, file, {
        contentType: file.type,
        // Never overwrite: the key is a fresh uuid, so an upsert could only
        // ever mean something has gone wrong upstream.
        upsert: false,
        // These are immutable once written — a new picture is a new key — so
        // they can be cached hard.
        cacheControl: "31536000",
      });

    if (error) throw error;

    /**
     * Built here rather than through `getPublicUrl`, which needs a client and
     * returns the same string. The bucket is public, so this is a plain,
     * permanent address.
     */
    const url = `${publicEnv.supabaseUrl}/storage/v1/object/public/campaign-media/${key}`;

    return { ok: true, url };
  } catch (err) {
    const result = fail(err);
    return { ok: false, message: result.message };
  }
}
