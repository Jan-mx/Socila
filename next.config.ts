import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 单机部署使用 standalone 产物（REL-FR-001）；Vercel 兼容（其部署忽略该配置）
  output: "standalone",
  // External packages that should not be bundled (Node.js native modules)
  serverExternalPackages: ["bcryptjs", "xlsx"],
};

export default nextConfig;
