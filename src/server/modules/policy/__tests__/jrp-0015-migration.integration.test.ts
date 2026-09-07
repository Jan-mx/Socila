/**
 * 任务3（JRP-FR-005/009）0015版本化migration行为测试：
 * 地区规划发布记录表、plans留痕列、约束矩阵与幂等重跑。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已执行全部migration的全新 PostgreSQL 17 库；
 * 未设置时直接失败（不允许skip）。测试在事务内执行migration SQL并回滚，不污染演练库。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

const MIGRATION_FILE = path.join(
  process.cwd(),
  "drizzle/0015_jurisdiction_planning_releases.sql",
);

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
  opts: { expectAbort?: RegExp } = {},
): Promise<void> {
  await client.query("BEGIN");
  try {
    await setup(client);
    let aborted: Error | null = null;
    try {
      await client.query(readFileSync(MIGRATION_FILE, "utf8"));
    } catch (err) {
      aborted = err as Error;
    }
    if (opts.expectAbort) {
      expect(aborted, "migration应中止但未中止").not.toBeNull();
      expect(aborted?.message ?? "").toMatch(opts.expectAbort);
    } else {
      expect(aborted, `migration不应失败: ${aborted?.message ?? ""}`).toBeNull();
    }
  } finally {
    await client.query("ROLLBACK");
  }
}

describe("0015 地区规划发布记录migration（JRP-FR-005/009）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
  });

  it("创建发布记录表与 plans 留痕列，重复执行幂等", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        // 表与列存在。
        const table = await c.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'jurisdiction_planning_releases'
           ORDER BY column_name`,
        );
        const cols = table.rows.map((r) => r.column_name);
        expect(cols).toEqual(
          expect.arrayContaining([
            "id",
            "jurisdiction_code",
            "active_snapshot_id",
            "status",
            "gate_results",
            "activated_at",
            "activated_by",
            "updated_at",
          ]),
        );
        const planCols = await c.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'plans' AND column_name IN
             ('jurisdiction_code','resolved_jurisdiction_path','snapshot_id')`,
        );
        expect(planCols.rows).toHaveLength(3);
        // 唯一索引。
        const uniq = await c.query(
          `SELECT indexname FROM pg_indexes
           WHERE tablename = 'jurisdiction_planning_releases'
             AND indexname IN
               ('jurisdiction_planning_releases_jurisdiction_unique',
                'jurisdiction_planning_releases_active_snapshot_unique')`,
        );
        expect(uniq.rows).toHaveLength(2);
        // 幂等重跑。
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));
      });
    });
  });

  it("约束矩阵：非法status拒绝、active缺少快照/激活人/时间拒绝（JRP-FR-005）", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));
        // 非法 status：不满足 status_check 且不满足 active_required_check。
        // 每个预期失败用 SAVEPOINT 隔离，避免 aborted 事务级联。
        await c.query("SAVEPOINT sp_status");
        await expect(
          c.query(
            `INSERT INTO jurisdiction_planning_releases (jurisdiction_code, status)
             VALUES ('310000', 'weird')`,
          ),
        ).rejects.toThrow(/jurisdiction_planning_releases/);
        await c.query("ROLLBACK TO SAVEPOINT sp_status");

        // active 缺少快照/激活人/时间：违反 active_required_check。
        await c.query("SAVEPOINT sp_active");
        await expect(
          c.query(
            `INSERT INTO jurisdiction_planning_releases
               (jurisdiction_code, active_snapshot_id, status, activated_at, activated_by)
             VALUES ('310000', NULL, 'active', NULL, NULL)`,
          ),
        ).rejects.toThrow(/jurisdiction_planning_releases_active_required_check/);
        await c.query("ROLLBACK TO SAVEPOINT sp_active");

        // 合法 inactive 可插入（无快照引用）。
        await c.query(
          `INSERT INTO jurisdiction_planning_releases (jurisdiction_code, status)
           VALUES ('510000', 'inactive')`,
        );
      });
    });
  });

  it("plans.snapshot_id 外键指向 policy_snapshots，非法快照ID被拒绝（JRP-FR-009）", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));
        await c.query("SAVEPOINT sp_plan_fk");
        await expect(
          c.query(
            `INSERT INTO plans (id, user_input, snapshot_id)
             VALUES (gen_random_uuid(), '{}'::jsonb, gen_random_uuid())`,
          ),
        ).rejects.toThrow(/plans_snapshot_id_fk/);
        await c.query("ROLLBACK TO SAVEPOINT sp_plan_fk");
      });
    });
  });
});
