import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // region profiles and fallback fixtures are read from disk at
  // runtime by the API adapters — make sure they are traced into the
  // serverless bundle (Vercel) rather than only at build time
  outputFileTracingIncludes: {
    "/api/**": ["./data/regions/**/*", "./fixtures/**/*"],
  },
};

export default nextConfig;
