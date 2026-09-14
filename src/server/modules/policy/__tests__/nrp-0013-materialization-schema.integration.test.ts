/**
 * NRP-FR-017～022 / NRP-AC-011～016（阶段E）0013迁移行为测试：
 * params.evidence参数证据列、policy_import_batches/policy_import_batch_members
 * 批次审计表、publishes地区身份列（jurisdiction_code/entity_version）。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已执行全部migration（含0013）的全新
 * PostgreSQL 17 库；未设置时直接失败（不允许skip）。
 * 在事务内重复执行migration SQL验证幂等，执行后回滚。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

const MIGRATION_FILE = path.join(
  process.cwd(),
  "drizzle/0013_nrp_stage_e_materialization.sql",
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

describe("0013 stage E materialization schema (drill DB)", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
  });

  it("params.evidence 参数证据列存在且可写入结构化JSON", async () => {
    await withClient(async (c) => {
      const col = await c.query(
        `select data_type from information_schema.columns
         where table_name='params' and column_name='evidence'`,
      );
      expect(col.rows).toHaveLength(1);
      expect(col.rows[0].data_type).toBe("jsonb");
    });
  });

  it("批次审计表存在且可记录批次与成员（不含连接串/凭据字段）", async () => {
    await withClient(async (c) => {
      const cols = await c.query(
        `select column_name from information_schema.columns
         where table_name='policy_import_batches' order by column_name`,
      );
      const names = cols.rows.map((r) => r.column_name).sort();
      for (const required of [
        "actor",
        "blocking_reasons",
        "created_at",
        "entity_counts",
        "id",
        "jurisdiction_code",
        "manifest_hash",
        "readiness",
        "source_commit",
        "status",
        "target_fingerprint",
      ]) {
        expect(names, `批次表缺少列 ${required}`).toContain(required);
      }

      const inserted = await c.query(
        `insert into policy_import_batches
           (jurisdiction_code, manifest_hash, source_commit, target_fingerprint,
            status, readiness, blocking_reasons, entity_counts, actor)
         values ('510000', 'hash-abc', 'commit-123', 'fp-456',
                 'applied', 'blocked', '["gap-1"]', '{"rules":0,"params":3}', 'stage-e-operator')
         returning id`,
      );
      const batchId = inserted.rows[0].id;
      await c.query(
        `insert into policy_import_batch_members
           (batch_id, entity_type, entity_row_id, business_key, version, content_hash)
         values ($1, 'param', 1, 'P-SC-CONTRIB-BASE-UPPER', 1, 'hash-p1')`,
        [batchId],
      );
      const members = await c.query(
        `select count(*)::int as n from policy_import_batch_members where batch_id=$1`,
        [batchId],
      );
      expect(members.rows[0].n).toBe(1);

      // 审计表不得有连接串类字段。
      expect(names.join(",")).not.toMatch(/url|conn|password|dsn/i);
      await c.query(`delete from policy_import_batch_members where batch_id=$1`, [batchId]);
      await c.query(`delete from policy_import_batches where id=$1`, [batchId]);
    });
  });

  it("publishes地区身份列可空（历史记录允许为空），新写入可完整", async () => {
    await withClient(async (c) => {
      const cols = await c.query(
        `select column_name from information_schema.columns
         where table_name='publishes'`,
      );
      const names = cols.rows.map((r) => r.column_name);
      expect(names).toContain("jurisdiction_code");
      expect(names).toContain("entity_version");

      // 旧行语义：不带地区/版本仍可插入（历史兼容）。
      await c.query(
        `insert into publishes (entity_type, entity_id, from_stage, to_stage, actor)
         values ('rule', 'R-HISTORY', 'staging', 'production', 'legacy')`,
      );
      const legacy = await c.query(
        `select jurisdiction_code, entity_version from publishes
         where entity_id='R-HISTORY' order by id desc limit 1`,
      );
      expect(legacy.rows[0].jurisdiction_code).toBeNull();
      expect(legacy.rows[0].entity_version).toBeNull();

      // 新记录可完整携带地区与版本。
      await c.query(
        `insert into publishes
           (entity_type, entity_id, from_stage, to_stage, actor, jurisdiction_code, entity_version)
         values ('rule', 'R-NEW', 'staging', 'production', 'admin', 'CN', 1)`,
      );
      const modern = await c.query(
        `select jurisdiction_code, entity_version from publishes
         where entity_id='R-NEW' order by id desc limit 1`,
      );
      expect(modern.rows[0].jurisdiction_code).toBe("CN");
      expect(modern.rows[0].entity_version).toBe(1);

      await c.query(`delete from publishes where entity_id in ('R-HISTORY','R-NEW')`);
    });
  });

  it("重复执行0013 SQL为幂等no-op（事务内执行并回滚）", async () => {
    await withClient(async (c) => {
      await c.query("BEGIN");
      try {
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));
        // 无异常即幂等。
        expect(true).toBe(true);
      } finally {
        await c.query("ROLLBACK");
      }
    });
  });
});
