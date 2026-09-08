/**
 * CLG-FR-016/CLG-AC-011/012 公开与管理入口（路由级）：
 * - 公开 /api/showcase-cases 只返回 selected+published（治理后36条）；
 * - 管理 /api/admin/cases 默认只显示 quality_status='active'（治理后452条）；
 * - 归档管理接口只返回批次/条目元数据（UID/哈希/原因），无法获取正文或dump；
 * - POST 归档接口被拒绝（仅本地受控脚本可写）。
 *
 * Red：quality_status过滤未实现时返回117/851；0016未实现时归档表缺失。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { seedShowcaseCases } from "@/lib/showcase/seed-showcase";

type DbClient = Parameters<typeof seedShowcaseCases>[0];

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
const DRILL_DB = `clg_api_${Date.now().toString(36)}`;
let url = "";
let pool: Pool | null = null;
let db: DbClient;

async function adminClient(): Promise<Client> {
  const base = new URL(DRILL_URL!);
  base.pathname = "/postgres";
  const c = new Client({ connectionString: base.toString() });
  c.on("error", () => undefined);
  await c.connect();
  return c;
}

function jsonRequest(route: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("CLG-AC-011/012 公开与管理案例入口（独立动态库）", () => {
  beforeAll(async () => {
    if (!DRILL_URL) throw new Error("SOCILA_TEST_DATABASE_URL 未设置");
    const admin = await adminClient();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${DRILL_DB}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${DRILL_DB}"`);
    } finally {
      await admin.end();
    }
    const base = new URL(DRILL_URL);
    base.pathname = `/${DRILL_DB}`;
    url = base.toString();
    // 独立drizzle实例（route依赖门禁禁止测试文件直接import @/lib/db）；
    // route经@/lib/db单例查询，进程DATABASE_URL必须指向动态库
    process.env.DATABASE_URL = url;
    pool = new Pool({ connectionString: url, max: 2 });
    db = drizzle({ client: pool }) as unknown as DbClient;
    // migration已含0016（共享实例）：重新跑migration保证journal一致
    const { execFileSync } = await import("node:child_process");
    execFileSync("node", ["scripts/run-migrations.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    // seed：851案例+500回归+示例（含DSL地区示例）
    const { execFileSync: exec } = await import("node:child_process");
    const pathMod = await import("node:path");
    exec(process.execPath, [
      pathMod.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      "src/lib/db/seed/index.ts",
    ], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    const col = await db.execute(sql`SELECT 1 FROM information_schema.columns WHERE table_name='showcase_cases' AND column_name='quality_status'`);
    if (col.rowCount !== 1) {
      throw new Error(`动态库缺少0016列：showcase_cases.quality_status（migration未生效）`);
    }
    const { seedShowcaseCases: seedShowcase } = await import("@/lib/showcase/seed-showcase");
    await seedShowcase(db);
  }, 240_000);

  afterAll(async () => {
    // 先关闭全部连接（本地pool + @/lib/db单例pool），再DROP避免残留连接被终止
    await pool?.end();
    const { closeDatabase } = await import("@/lib/db");
    await closeDatabase();
    const admin = await adminClient();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${DRILL_DB}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }, 60_000);

  it("CLG-AC-011：公开API治理前（无selected）返回空，治理后只返回36条selected", async () => {
    const { GET } = await import("@/app/api/showcase-cases/route");
    const before = await GET();
    const beforeJson = await before.json();
    expect(beforeJson.cases).toHaveLength(0); // 治理前无quality_status=selected

    // 治理镜像：36条selected + 81条archive_candidate
    await db.execute(sql`
      UPDATE showcase_cases SET quality_status='selected', is_published=true
      WHERE id IN (SELECT id FROM showcase_cases ORDER BY id LIMIT 36)`);
    await db.execute(sql`
      UPDATE showcase_cases SET quality_status='archive_candidate'
      WHERE quality_status IS NULL`);
    const after = await GET();
    const afterJson = await after.json();
    expect(afterJson.cases).toHaveLength(36);
    for (const c of afterJson.cases) {
      expect(c.qualityStatus).toBe("selected");
    }
  });

  it("CLG-FR-016：管理案例默认只显示active记录", async () => {
    const { GET: adminCases } = await import("@/app/api/admin/cases/route");
    const totalCases = await db.execute(sql`SELECT count(*)::int AS n FROM cases`);
    expect(Number(totalCases.rows[0].n)).toBe(851);
    await db.execute(sql`
      UPDATE cases SET quality_status='active'
      WHERE id IN (SELECT id FROM cases ORDER BY id LIMIT 100)`);
    const cnt = await db.execute(sql`SELECT count(*)::int AS n FROM cases WHERE quality_status='active'`);
    expect(Number(cnt.rows[0].n)).toBe(100);
    const res = await adminCases(jsonRequest("/api/admin/cases", "GET"));
    const json = await res.json();
    expect(res.status).toBe(200);
    // 未治理的851条中只有100条active → total=100（默认过滤active）
    expect(json.total).toBe(100);
  });

  it("CLG-AC-012：归档管理接口只返回元数据；POST被拒绝", async () => {
    const { GET: archiveGet, POST: archivePost } = await import(
      "@/app/api/admin/case-archive/route"
    );
    const res = await archiveGet();
    const json = await res.json();
    expect(Array.isArray(json.batches)).toBe(true);

    const postRes = await archivePost();
    expect(postRes.status).toBe(403);

    const { GET: batchGet } = await import(
      "@/app/api/admin/case-archive/[batchId]/route"
    );
    const missing = await batchGet(jsonRequest("/api/admin/case-archive/none", "GET"), {
      params: Promise.resolve({ batchId: "00000000-0000-0000-0000-000000000099" }),
    });
    expect(missing.status).toBe(404);
  });
});