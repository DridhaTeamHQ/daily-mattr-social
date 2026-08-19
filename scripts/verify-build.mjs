/**
 * Fails the build if the deployment would not be able to process an image.
 *
 * Screenshot uploads returned 500 for four and a half hours because sharp's
 * Linux binary was never shipped into the function. Nothing caught it: the
 * build succeeded, every page rendered, and the only symptom was students
 * seeing "Something broke" on the one action that matters most to them. The
 * gap was that a native dependency can be absent without anything failing
 * until a user asks for it.
 *
 * So this checks the two things that were actually wrong, in the order they
 * went wrong:
 *
 *   1. Is the platform binary installed at all?
 *   2. Did output file tracing carry it into the routes that use it?
 *
 * The second is the one that bit us and the one a plain `require("sharp")`
 * would have missed — sharp loads fine on the build machine while the traced
 * function ships without it. Checking the trace manifest is checking what is
 * actually deployed.
 *
 * Plain .mjs so it runs on `node` with no loader, and wired to `postbuild` so
 * it runs on Vercel as part of every deploy. A failure here is a failed
 * deploy, which is the entire point: better to not ship than to ship an
 * upload button that 500s.
 *
 * Non-Linux builds only warn. A developer building on Windows or macOS cannot
 * tell us anything about the Linux artefact, and failing their local build
 * over it would just teach them to skip the script.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROUTES = [
  ".next/server/app/dashboard/campaigns/page.js.nft.json",
  ".next/server/app/admin/review/page.js.nft.json",
];

const isLinux = process.platform === "linux";
const arch = process.arch === "arm64" ? "arm64" : "x64";
const problems = [];
const notes = [];

// ─── 1. Installed? ──────────────────────────────────────────────────────────

const imgDir = "node_modules/@img";
const installed = existsSync(imgDir) ? readdirSync(imgDir) : [];
const wanted = `sharp-linux-${arch}`;
const wantedLibvips = `sharp-libvips-linux-${arch}`;

if (isLinux) {
  if (!installed.includes(wanted)) {
    problems.push(
      `@img/${wanted} is not installed. npm skipped it as an optional dependency, which is silent — declare it in optionalDependencies so the install is explicit.`,
    );
  }
  if (!installed.includes(wantedLibvips)) {
    problems.push(
      `@img/${wantedLibvips} is not installed. This is the package that provides libvips-cpp.so, the file whose absence produced ERR_DLOPEN_FAILED.`,
    );
  }
} else {
  notes.push(
    `platform is ${process.platform}, so the Linux artefact cannot be checked here — this runs for real on the deploy.`,
  );
}

// ─── 2. Shipped? ────────────────────────────────────────────────────────────

for (const route of ROUTES) {
  if (!existsSync(route)) {
    problems.push(
      `no trace manifest at ${route}. If that route moved, update ROUTES here and the outputFileTracingIncludes key in next.config.ts together — a stale path means this check silently passes.`,
    );
    continue;
  }

  const files = JSON.parse(readFileSync(route, "utf8")).files ?? [];
  const img = files.filter((f) => f.includes("@img"));

  if (img.length === 0) {
    problems.push(
      `${route} traces no @img files at all — outputFileTracingIncludes is not matching this route.`,
    );
    continue;
  }

  if (isLinux) {
    const hasBinary = img.some((f) => f.includes(wanted));
    const hasSharedObject = img.some((f) => f.includes(".so"));

    if (!hasBinary || !hasSharedObject) {
      problems.push(
        `${route} traces ${img.length} @img files but ${
          !hasBinary ? `none from @img/${wanted}` : "no .so"
        }. The function would deploy without the native library and every upload would 500.`,
      );
    }
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────

const label = "verify-build";

if (problems.length > 0) {
  console.error(`\n[${label}] this build would not be able to process images:\n`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error("");
  process.exit(1);
}

const traced = existsSync(ROUTES[0])
  ? (JSON.parse(readFileSync(ROUTES[0], "utf8")).files ?? []).filter((f) =>
      f.includes("@img"),
    ).length
  : 0;

console.log(
  `[${label}] image pipeline ok — ${installed.length} @img package(s) installed, ${traced} traced into the upload route.`,
);
for (const note of notes) console.log(`[${label}] note: ${note}`);
