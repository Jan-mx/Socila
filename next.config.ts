import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 单机部署使用 standalone 产物（REL-FR-001 / 09-03 CFG-FR-010：仅 Compose 部署）
  output: "standalone",
  // External packages that should not be bundled (Node.js native modules)
  serverExternalPackages: ["bcryptjs", "xlsx"],
  async redirects() {
    return [
      // 09-02 AUTH-FR-013：旧管理登录入口安全重定向到统一登录页（308），
      // 不保留第二套登录实现。
      {
        source: "/admin/login",
        destination: "/login?callbackUrl=%2Fadmin",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
