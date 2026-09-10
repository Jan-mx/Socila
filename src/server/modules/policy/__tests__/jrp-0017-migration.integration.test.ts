/**
 * 任务3（JRP-FR-024/025/029、JRP-AC-005/011/012）0017快照区间migration行为测试：
 * - 发布记录增加 effective_from/effective_to 区间列，active 区间必须闭合定义；
 * - 同一地区 active 区间不得重叠（EXCLUDE 约束，重叠插入拒绝）；
 * - 每地区可存在多条发布记录（0015 的每地区唯一索引被替换）；
 * - plans 增加 snapshot_content_hash（历史重放按 ID+hash，JRP-FR-014/028）；
 * - 0015/0016 历史 SQL 文件哈希保持不变（JRP-AC-012）。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已执行全部migration的全新 PostgreSQL 17 库；
 * 未设置时直接失败（不允许skip）。测试在事务内执行migration SQL并回滚，不污染演练库。
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
const DRIZZLE_DIR = path.join(process.cwd(), "drizzle");

const MIGRATION_FILE = path.join(DRIZZLE_DIR, "0017_jurisdiction_snapshot_schedules.sql");
const MIGRATION_0015 = path.join(DRIZZLE_DIR, "0015_jurisdiction_planning_releases.sql");
const MIGRATION_0016 = path.join(DRIZZLE_DIR, "0016_clg_case_governance.sql");

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DRILL_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function runInTx(
  client: Client,
  setup: (c: Client) => Promise<void>,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await setup(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

describe("0017 快照区间migration（JRP-FR-024/025/029/AC-012）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
  });

  it("加列 effective_from/effective_to 与 plans.snapshot_content_hash，重复执行幂等", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        // 共享演练库可能已有其他集成测试写入的区间行，事务内清空后独立验证。
        await c.query(`DELETE FROM jurisdiction_planning_releases`);
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));
        const cols = await c.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'jurisdiction_planning_releases'
             AND column_name IN ('effective_from','effective_to')`,
        );
        expect(cols.rows).toHaveLength(2);
        const planCol = await c.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'plans' AND column_name = 'snapshot_content_hash'`,
        );
        expect(planCol.rows).toHaveLength(1);
        // 幂等重跑。
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));
      });
    });
  });

  it("约束矩阵：active缺少effective_from拒绝、区间顺序非法拒绝（JRP-FR-024）", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        await c.query(`DELETE FROM jurisdiction_planning_releases`);
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));

        // 需要一个合法快照行支撑 active 外键。
        await c.query(
          `INSERT INTO policy_snapshots (id, jurisdiction_code, as_of_date, resolved_path, content_hash, created_by)
           VALUES (gen_random_uuid(), '440000', '2026-01-01', '/CN/440000/', 'deadbeef', 'test')`,
        );
        const snap = await c.query(
          `SELECT id FROM policy_snapshots WHERE jurisdiction_code='440000' LIMIT 1`,
        );

        // active 缺少 effective_from：拒绝。
        await c.query("SAVEPOINT sp_no_from");
        await expect(
          c.query(
            `INSERT INTO jurisdiction_planning_releases
               (jurisdiction_code, active_snapshot_id, status, activated_at, activated_by, effective_to)
             VALUES ('440000', '${snap.rows[0].id}', 'active', now(), 'admin', '2030-01-01')`,
          ),
        ).rejects.toThrow(/effective/);
        await c.query("ROLLBACK TO SAVEPOINT sp_no_from");

        // effective_to 早于 effective_from：拒绝。
        await c.query("SAVEPOINT sp_bad_range");
        await expect(
          c.query(
            `INSERT INTO jurisdiction_planning_releases
               (jurisdiction_code, active_snapshot_id, status, activated_at, activated_by, effective_from, effective_to)
             VALUES ('440000', '${snap.rows[0].id}', 'active', now(), 'admin', '2030-01-01', '2026-01-01')`,
          ),
        ).rejects.toThrow(/effective/);
        await c.query("ROLLBACK TO SAVEPOINT sp_bad_range");

        // 合法 active 区间可插入。
        await c.query(
          `INSERT INTO jurisdiction_planning_releases
             (jurisdiction_code, active_snapshot_id, status, activated_at, activated_by, effective_from, effective_to)
           VALUES ('440000', '${snap.rows[0].id}', 'active', now(), 'admin', '2026-01-01', '2029-12-31')`,
        );
      });
    });
  });

  it("同地区 active 区间重叠被拒绝；不重叠区间可共存（JRP-FR-024/AC-005/011）", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        await c.query(`DELETE FROM jurisdiction_planning_releases`);
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));

        const snap1 = await c.query(
          `INSERT INTO policy_snapshots (jurisdiction_code, as_of_date, resolved_path, content_hash, created_by)
           VALUES ('440000', '2026-01-01', '/CN/440000/', 'hash-2026', 'test') RETURNING id`,
        );
        const snap2 = await c.query(
          `INSERT INTO policy_snapshots (jurisdiction_code, as_of_date, resolved_path, content_hash, created_by)
           VALUES ('440000', '2030-01-01', '/CN/440000/', 'hash-2030', 'test') RETURNING id`,
        );
        const snap3 = await c.query(
          `INSERT INTO policy_snapshots (jurisdiction_code, as_of_date, resolved_path, content_hash, created_by)
           VALUES ('440000', '2028-06-01', '/CN/440000/', 'hash-2028', 'test') RETURNING id`,
        );

        // 2026 窗口区间。
        await c.query(
          `INSERT INTO jurisdiction_planning_releases
             (jurisdiction_code, active_snapshot_id, status, activated_at, activated_by, effective_from, effective_to)
           VALUES ('440000', '${snap1.rows[0].id}', 'active', now(), 'admin', '2026-01-01', '2029-12-31')`,
        );
        // 2030 窗口区间（开放上界），与2026不重叠 → 允许。
        await c.query(
          `INSERT INTO jurisdiction_planning_releases
             (jurisdiction_code, active_snapshot_id, status, activated_at, activated_by, effective_from)
           VALUES ('440000', '${snap2.rows[0].id}', 'active', now(), 'admin', '2030-01-01')`,
        );

        // 与2026窗口部分重叠 → 拒绝（EXCLUDE 约束）。
        await c.query("SAVEPOINT sp_overlap");
        await expect(
          c.query(
            `INSERT INTO jurisdiction_planning_releases
               (jurisdiction_code, active_snapshot_id, status, activated_at, activated_by, effective_from, effective_to)
             VALUES ('440000', '${snap3.rows[0].id}', 'active', now(), 'admin', '2028-06-01', '2035-12-31')`,
          ),
        ).rejects.toThrow(/overlap|EXCLUDE|gist|conflicting|daterange/);
        await c.query("ROLLBACK TO SAVEPOINT sp_overlap");
      });
    });
  });

  it("每地区多条发布记录（0015 唯一索引被替换为区间约束）", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        await c.query(`DELETE FROM jurisdiction_planning_releases`);
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));
        const oldIdx = await c.query(
          `SELECT indexname FROM pg_indexes
           WHERE tablename = 'jurisdiction_planning_releases'
             AND indexname = 'jurisdiction_planning_releases_jurisdiction_unique'`,
        );
        expect(oldIdx.rows).toHaveLength(0);

        const snap1 = await c.query(
          `INSERT INTO policy_snapshots (jurisdiction_code, as_of_date, resolved_path, content_hash, created_by)
           VALUES ('310000', '2026-01-01', '/CN/310000/', 'h1', 'test') RETURNING id`,
        );
        const snap2 = await c.query(
          `INSERT INTO policy_snapshots (jurisdiction_code, as_of_date, resolved_path, content_hash, created_by)
           VALUES ('310000', '2030-01-01', '/CN/310000/', 'h2', 'test') RETURNING id`,
        );
        await c.query(
          `INSERT INTO jurisdiction_planning_releases
             (jurisdiction_code, active_snapshot_id, status, activated_at, activated_by, effective_from, effective_to)
           VALUES ('310000', '${snap1.rows[0].id}', 'active', now(), 'admin', '2026-01-01', '2026-12-31')`,
        );
        // 同一地区第二条记录（不同区间，不重叠）允许。
        await c.query(
          `INSERT INTO jurisdiction_planning_releases
             (jurisdiction_code, active_snapshot_id, status, activated_at, activated_by, effective_from)
           VALUES ('310000', '${snap2.rows[0].id}', 'active', now(), 'admin', '2027-01-01')`,
        );
        const count = await c.query(
          `SELECT count(*)::int AS n FROM jurisdiction_planning_releases WHERE jurisdiction_code='310000'`,
        );
        expect(count.rows[0].n).toBe(2);
      });
    });
  });
});

describe("0015/0016 历史SQL哈希不变量（JRP-AC-012）", () => {
  it("0015与0016 SQL 文件哈希与基线提交一致（未改写历史迁移）", () => {
    const sha = (p: string) =>
      createHash("sha256").update(readFileSync(p, "utf8")).digest("hex");

    // 基线：任务3分支引入0015、任务4分支引入0016时的**Git blob（LF）内容哈希**。
    // WI-20260907-03第四轮复审：仓库根.gitattributes固定 drizzle/*.sql 为
    // text eol=lf 后，工作树文件恒为LF，Drizzle读取hash === Git blob SHA ===
    // 账本规范hash（持久库账本ID 15/16即3ae5b95f…/3a9adc91…）。
    // 旧基线4ac11ead…是core.autocrlf=true把工作树写成CRLF时的伪hash，已废弃。
    // 若历史语义被改动，此断言失败；哈希值随文件内容变化而更新属于警示信号。
    const h15 = sha(MIGRATION_0015);
    expect(h15).toBe("3ae5b95f3f28ef2de1f11a1115b6dd396e3fa8b374cab0b1b8aa1a4589529d87");

    const h16 = sha(MIGRATION_0016);
    expect(h16).toBe("3a9adc91a1bfe7ddc895763c61a32811e4883458240284879ed5a5c3c130dfd5");
  });
});