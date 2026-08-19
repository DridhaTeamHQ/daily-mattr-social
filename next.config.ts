import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  experimental: {
    serverActions: {
      // Server Actions cap request bodies at 1MB by default, which silently
      // rejects any real screenshot. The bucket allows 10MB; the extra 2MB is
      // headroom for multipart boundaries and part headers.
      bodySizeLimit: "12mb",
    },
  },

  /**
   * Security headers.
   *
   * There were none. The three that matter here, in order of what they stop:
   *
   *  - HSTS: the session cookie travels on every request, and without it a
   *    single plain-http navigation is enough to hand it over.
   *  - frame-ancestors / X-Frame-Options: nothing in this app should ever be
   *    framed, and admin approve/reject buttons are exactly what clickjacking
   *    is for.
   *  - CSP: the survey pages render text a stranger typed. Everything else is
   *    defence in depth behind React's escaping.
   *
   * `unsafe-inline`/`unsafe-eval` on script-src are not an oversight — Next's
   * inlined bootstrap and React Compiler output need them, and a nonce-based
   * policy needs the middleware to rewrite every response. This is the honest
   * ceiling for a CSP added without that work; it still blocks a foreign
   * script host, which is the realistic delivery route.
   */
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // Supabase storage serves screenshots; data: covers the canvas share card.
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      // Supabase REST/auth/realtime, and the OpenAI call for screenshot review.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },

  /**
   * Ship sharp's native library with the functions that use it.
   *
   * Uploading a screenshot returned 500 in production with
   *   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
   * while working locally, because the two environments fail differently:
   * sharp is on Next's built-in external list, so it is `require`d at runtime
   * rather than bundled, and output file tracing followed the JS but not the
   * platform binary it dlopens. Locally the file is simply there in
   * node_modules; on Vercel the function shipped without it.
   *
   * The glob covers every @img platform package rather than naming
   * linux-x64: the correct one differs by build machine, an unused one is a
   * few unreferenced megabytes, and a missing one is every upload failing.
   *
   * Keyed to the routes that actually read an image — the student upload and
   * the admin review queue that re-checks it — so nothing else carries the
   * weight.
   */
  outputFileTracingIncludes: {
    "/dashboard/campaigns": ["./node_modules/@img/**/*"],
    "/dashboard/campaigns/**": ["./node_modules/@img/**/*"],
    "/admin/review": ["./node_modules/@img/**/*"],
  },

  // The banner tells an attacker which framework and version to look up.
  poweredByHeader: false,

  async redirects() {
    return [
      {
        // /admin/payouts shipped to production before the section folded into
        // Stipend. A permanent redirect keeps every bookmark and old
        // notification link working instead of 404ing on them.
        source: "/admin/payouts",
        destination: "/admin/stipend",
        permanent: true,
      },
      {
        // Same for the batch CSV, whose export route moved with it.
        source: "/admin/payouts/:id/export",
        destination: "/admin/stipend/batch/:id/export",
        permanent: true,
      },
    ];
  },

  turbopack: {
    // There is a stray package-lock.json in the user's home directory, and
    // Turbopack's root inference picks the outermost lockfile it finds. Pin the
    // root here so the build doesn't wander up into C:\Users\Tamada.
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
