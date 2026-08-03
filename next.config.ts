import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  turbopack: {
    // There is a stray package-lock.json in the user's home directory, and
    // Turbopack's root inference picks the outermost lockfile it finds. Pin the
    // root here so the build doesn't wander up into C:\Users\Tamada.
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
