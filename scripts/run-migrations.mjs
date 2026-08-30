/**
 * 版本化 migration 执行器：drizzle-orm 官方 migrator + node-postgres。
 *
 * 为什么不用 `drizzle-kit migrate`：drizzle-kit 对 postgresql 方言自动探测驱动，
 * 探测到 @neondatabase/serverless 就用 websocket 连接，无法到达本地演练库，
 * 且 dialect=postgresql 不支持 driver 覆盖。本脚本用 pg（devDependency，仅
 * 迁移工具链使用）执行同一份 drizzle/meta/_journal.json 记账的迁移，与阶段
 * 02/07 的迁移路径一致。
 *
 * 用法：DATABASE_URL=postgresql://... node scripts/run-migrations.mjs
 * 生成新迁移：npx drizzle-kit generate（离线，无需数据库）。
 */
import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
} finally {
  await pool.end();
}
