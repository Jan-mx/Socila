/**
 * 版本化 migration 执行器：drizzle-orm 官方 migrator + node-postgres。
 *
 * 为什么不用 `drizzle-kit migrate`：drizzle-kit 对 postgresql 方言的驱动探测
 * 无法稳定锁定 node-postgres，本地/容器两种部署下的行为不一致。本脚本用 pg
 * （devDependency，仅迁移工具链使用）执行同一份 drizzle/meta/_journal.json
 * 记账的迁移，与阶段 02/07 的迁移路径一致。
 *
 * 配置加载（09-03 CFG-FR-002）：经共享加载器取 `.env.local` 优先、`.env`
 * 回退、进程变量不覆盖；宿主机目标固定 `localhost:5432/policyops`。
 *
 * 用法：DATABASE_URL=postgresql://... node scripts/run-migrations.mjs
 * 生成新迁移：npx drizzle-kit generate（离线，无需数据库）。
 */
import { loadEnvironment } from "./lib/load-environment.mjs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

loadEnvironment();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// 门禁：迁移执行默认只允许本地库，防止 dotenv 回退误连远程生产库。
{
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error("[db-guard] DATABASE_URL is not a valid URL");
    process.exit(1);
  }
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!isLocal && process.env.ALLOW_REMOTE_DATABASE !== "1") {
    console.error(
      `[db-guard] DATABASE_URL 指向非本机主机 (${host})。迁移默认只允许本地库；` +
        `确需远程（如阶段07获授权的生产迁移）请显式设置 ALLOW_REMOTE_DATABASE=1。`,
    );
    process.exit(1);
  }
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
} finally {
  await pool.end();
}
