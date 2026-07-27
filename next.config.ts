import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serverless-compatible: no standalone output needed for Vercel
  // External packages that should not be bundled (Node.js native modules)
  serverExternalPackages: ["bcryptjs", "xlsx"],
};

export default nextConfig;
