import { createHash } from "node:crypto";

import type SharpNS from "sharp";

// Deliberately not marked `server-only`: `scripts/seed.ts` runs this under
// plain Node, where the `server-only` shim throws. Importing `sharp` already
// makes this impossible to pull into a client bundle.

/**
 * Image fingerprinting for screenshot submissions.
 *
 * Two different hashes, doing two different jobs:
 *
 *   sha256  — exact bytes. Catches a file re-uploaded verbatim.
 *   dhash   — perceptual. Catches the same picture after it has been
 *             screenshotted again, recompressed, or passed through WhatsApp,
 *             all of which change every byte.
 *
 * The perceptual one is what actually catches fraud; the exact one is free.
 */

/**
 * sharp, loaded on first use rather than at import.
 *
 * It was a top-level import, and that is what took the whole upload route
 * down in production: sharp is on Next's built-in external list, so it is
 * `require`d at runtime, and when its native library was missing the failure
 * happened while the MODULE was loading — before any function body ran, where
 * no try/catch in the action could reach it. Every screenshot upload returned
 * a 500 and the student saw "Something broke".
 *
 * Loading it here means the same failure surfaces inside a function call,
 * where callers can decide what to do about it. Cached, so the cost is paid
 * once per instance.
 */
let sharpModule: typeof SharpNS | null = null;
let sharpFailed = false;

export async function loadSharp(): Promise<typeof SharpNS | null> {
  if (sharpModule) return sharpModule;
  if (sharpFailed) return null;

  try {
    sharpModule = (await import("sharp")).default;
    return sharpModule;
  } catch (cause) {
    // Logged once, loudly: image fingerprinting is a fraud control, and
    // running without it silently is not something to discover later.
    sharpFailed = true;
    console.error(
      "[images] sharp could not be loaded; screenshots will skip fingerprinting and go to manual review.",
      cause,
    );
    return null;
  }
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * 64-bit difference hash, returned as a string of '0' and '1' so it can go
 * straight into a Postgres `bit(64)` column.
 *
 * Reduce to 9×8 greyscale, then compare each pixel with its right-hand
 * neighbour: 8 comparisons per row × 8 rows = 64 bits. Robust to scaling,
 * recompression and small brightness shifts; sensitive to actual content.
 */
export async function dhash64(buffer: Buffer): Promise<string> {
  const sharp = await loadSharp();
  if (!sharp) throw new Error("sharp unavailable");

  const { data } = await sharp(buffer)
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left > right ? "1" : "0";
    }
  }
  return bits;
}

/** Hamming distance between two dhash bit-strings. Mirrors bit_count(a # b). */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) throw new Error("hash length mismatch");
  let distance = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) distance++;
  return distance;
}

export type ImageFacts = {
  sha256: string;
  /** Null when sharp is unavailable — see loadSharp. */
  phash: string | null;
  width: number | null;
  height: number | null;
  byteSize: number;
  mimeType: string;
  /** EXIF capture time, when the file carries one. */
  capturedAt: string | null;
};

/**
 * Everything the submissions table records about an uploaded image.
 *
 * Note `capturedAt` is frequently null: a screenshot taken on a phone usually
 * has no EXIF DateTimeOriginal, and anything that has been through a chat app
 * has had its metadata stripped. Absence is not evidence of tampering.
 */
export async function readImageFacts(buffer: Buffer): Promise<ImageFacts> {
  const sharp = await loadSharp();

  /**
   * Without sharp there is no width, no format and no perceptual hash — so
   * the checks that depend on them cannot run, and the submission goes to a
   * human instead of being auto-approved. That is the right way to lose this
   * capability: a reviewer does the work the fingerprint would have done.
   * Refusing the upload instead would punish the student for our deployment.
   */
  if (!sharp) {
    return {
      sha256: sha256(buffer),
      phash: null,
      width: null,
      height: null,
      byteSize: buffer.byteLength,
      mimeType: "application/octet-stream",
      capturedAt: null,
    };
  }

  const image = sharp(buffer);
  const metadata = await image.metadata();

  let capturedAt: string | null = null;
  if (metadata.exif) {
    try {
      const { parse } = await import("exifr");
      const exif = await parse(buffer, ["DateTimeOriginal", "CreateDate"]);
      const taken = exif?.DateTimeOriginal ?? exif?.CreateDate;
      if (taken instanceof Date && !Number.isNaN(taken.getTime())) {
        capturedAt = taken.toISOString();
      }
    } catch {
      // Malformed EXIF is common and harmless — treat it as absent.
    }
  }

  return {
    sha256: sha256(buffer),
    phash: await dhash64(buffer),
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    byteSize: buffer.byteLength,
    mimeType: metadata.format ? `image/${metadata.format}` : "application/octet-stream",
    capturedAt,
  };
}
