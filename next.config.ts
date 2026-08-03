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

  turbopack: {
    // There is a stray package-lock.json in the user's home directory, and
    // Turbopack's root inference picks the outermost lockfile it finds. Pin the
    // root here so the build doesn't wander up into C:\Users\Tamada.
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
