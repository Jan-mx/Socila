// 配置加载（09-03 CFG-FR-002）：与脚本/运行时共用同一套语义——
// .env.local 优先、.env 回退、进程变量不覆盖。
import { loadEnvironment } from "./scripts/lib/load-environment.mjs";
import { defineConfig } from "drizzle-kit";

loadEnvironment();

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
