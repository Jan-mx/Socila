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
    // 修复轮：集成用例执行预算提升到30s（默认5s）。不改变任何断言语义——
    // identity连续bcrypt注册/重置与rcl-rewrite-cli多次tsx子进程演练在负载
    // 波动下超过5s属执行时长问题；超时中断还会级联污染共享库状态（后续
    // 计数断言连锁失败）。断言、覆盖与skip纪律（PMG-FR-018）不变。
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
