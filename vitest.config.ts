import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// PMG-FR-005：单元/契约层入口（npm test）。
// 只运行不依赖数据库/外部服务的测试；全部数据库测试位于
// `*.integration.test.ts`，由 vitest.integration.config.ts（npm run test:db）串行运行。
// 本层不允许出现环境造成的 skip（describe.skipIf 等）。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["node_modules", ".next", "src/**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
