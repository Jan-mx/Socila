import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// PMG-FR-006：PostgreSQL 集成层入口（npm run test:db）。
// 全部 `*.integration.test.ts` 共用同一个已迁移的全新测试库，
// 关闭文件并行，避免共享数据库状态互相污染（PMG-FR-006）。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    exclude: ["node_modules", ".next"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
