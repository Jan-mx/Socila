/**
 * 任务4（RCL-FR-022、RCL-AC-014）0018案例库重建Schema迁移行为测试：
 * - 移除 cases/showcase_cases.jurisdiction_code 默认值（地区由生成器显式写入）；
 * - cases/showcase_cases 新增 scenario/generator/asOf/snapshotHash/input/expected/
 *   coverage/evidence/qualityBreakdown/assertions 字段；
 * - case_archive_batches CHECK 增加 applying（restore_verified→applying→applied）；
 * - case_archive_entries 增加 (batch_id, entity_type, entity_id) 唯一约束；
 * - 0016 历史 SQL 哈希不变（RCL-AC-014）。
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

const MIGRATION_FILE = path.join(DRIZZLE_DIR, "0018_case_library_rebuild.sql");
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

describe("0018 案例库重建migration（RCL-FR-022/AC-014）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
  });

  it("新增质量分解/生成元数据/断言字段，移除地区默认值，重复执行幂等", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));

        // cases 新列。
        const caseCols = await c.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'cases' AND column_name IN
             ('scenario_key','generator_version','as_of_date','snapshot_hash',
              'coverage_obligations','evidence','quality_breakdown','multi_labels')`,
        );
        expect(caseCols.rows).toHaveLength(8);

        // showcase_cases 新列（含 assertions）。
        const showCols = await c.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'showcase_cases' AND column_name IN
             ('scenario_key','generator_version','as_of_date','snapshot_hash',
              'coverage_obligations','evidence','quality_breakdown','multi_labels','assertions')`,
        );
        expect(showCols.rows).toHaveLength(9);

        // jurisdiction_code 默认值已移除（地区由生成器显式写入，RCL-FR-022）。
        const defCase = await c.query(
          `SELECT column_default FROM information_schema.columns
           WHERE table_name='cases' AND column_name='jurisdiction_code'`,
        );
        expect(defCase.rows[0].column_default).toBeNull();
        const defShow = await c.query(
          `SELECT column_default FROM information_schema.columns
           WHERE table_name='showcase_cases' AND column_name='jurisdiction_code'`,
        );
        expect(defShow.rows[0].column_default).toBeNull();

        // 幂等重跑。
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));
      });
    });
  });

  it("批次CHECK包含applying；归档条目唯一约束存在（RCL-FR-019/022）", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));

        // CHECK 约束包含 applying。
        const check = await c.query(
          `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
           WHERE conrelid='case_archive_batches'::regclass
             AND contype='c' AND conname='case_archive_batches_status_check'`,
        );
        expect(String(check.rows[0].def)).toContain("applying");

        // 唯一约束 (batch_id, entity_type, entity_id)。
        const uniq = await c.query(
          `SELECT indexname FROM pg_indexes
           WHERE tablename='case_archive_entries'
             AND indexname='case_archive_entries_batch_entity_unique'`,
        );
        expect(uniq.rows).toHaveLength(1);

        // 唯一约束生效：同批次同实体重复插入被拒。
        await c.query(
          `INSERT INTO case_archive_batches
             (id, status, source_counts, retained_counts, deleted_counts,
              table_hashes, manifest_hash, storage_path, created_by)
           VALUES (gen_random_uuid(), 'prepared', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
             '{}'::jsonb, 'mh-1', '/tmp/archive-1', 'test')`,
        );
        const batch = await c.query(
          `SELECT id FROM case_archive_batches WHERE manifest_hash='mh-1' LIMIT 1`,
        );
        await c.query(
          `INSERT INTO case_archive_entries
             (archive_batch_id, entity_type, entity_id, case_uid, content_hash, archive_reason)
           VALUES ('${batch.rows[0].id}', 'case', 1, 'UID-1', 'hash-1', 'test')`,
        );
        await c.query("SAVEPOINT sp_dup");
        await expect(
          c.query(
            `INSERT INTO case_archive_entries
               (archive_batch_id, entity_type, entity_id, case_uid, content_hash, archive_reason)
             VALUES ('${batch.rows[0].id}', 'case', 1, 'UID-1', 'hash-1', 'test')`,
          ),
        ).rejects.toThrow(/unique/);
        await c.query("ROLLBACK TO SAVEPOINT sp_dup");
      });
    });
  });
});

describe("0016 历史SQL哈希不变量（RCL-AC-014）", () => {
  it("0016 SQL 文件哈希与基线提交一致（未改写历史迁移）", () => {
    const sha = (p: string) =>
      createHash("sha256").update(readFileSync(p, "utf8")).digest("hex");
    expect(sha(MIGRATION_0016)).toBe(
      "3a9adc91a1bfe7ddc895763c61a32811e4883458240284879ed5a5c3c130dfd5",
    );
  });
});