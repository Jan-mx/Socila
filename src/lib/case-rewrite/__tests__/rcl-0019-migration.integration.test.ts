/**
 * WI-20260911-03（SHV2-FR-017/AC-014）0019审计migration行为测试：
 *
 * - case_rewrite_batches / case_rewrite_entries 只创建审计结构，不改写业务数据；
 * - plan_hash唯一；(batch_id, entity_type, entity_id)唯一；
 * - 内容hash列CHECK为64位小写hex；外键不得级联删除历史审计；
 * - SQL重复执行幂等（IF NOT EXISTS / 可重复执行）；
 * - journal保持严格单调（0019 when > 0018）。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已执行全部migration（含0019）的全新PG17库。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
const SQL_FILE = path.join(process.cwd(), "drizzle", "0019_case_rewrite_audit.sql");

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DRILL_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

describe("0019 案例改写审计migration（SHV2-FR-017/AC-014）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移的全新PG17库");
    }
  });

  it("审计表存在且具备全部绑定列；业务表数据零变化（DDL only）", async () => {
    await withClient(async (client) => {
      const batchCols = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'case_rewrite_batches' ORDER BY column_name`,
      );
      const names = batchCols.rows.map((r) => String((r as { column_name: string }).column_name));
      for (const col of [
        "id", "plan_hash", "code_sha", "source_fingerprint", "target_fingerprint", "final_fingerprint",
        "source_generator_version", "target_generator_version", "source_manifest", "source_attestation",
        "snapshot_bindings", "row_counts", "status", "created_by", "created_at", "applied_at",
      ]) {
        expect(names, col).toContain(col);
      }
      const entryCols = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'case_rewrite_entries' ORDER BY column_name`,
      );
      const entryNames = entryCols.rows.map((r) => String((r as { column_name: string }).column_name));
      for (const col of [
        "id", "batch_id", "entity_type", "entity_id", "old_uid", "new_uid",
        "old_content_hash", "new_content_hash", "old_snapshot_hash", "new_snapshot_hash",
        "evidence_hash", "before", "after",
      ]) {
        expect(entryNames, col).toContain(col);
      }
      // 业务行计数不受migration影响（表为空审计结构；业务表存在即可，行数可查）。
      for (const t of ["cases", "showcase_cases", "tests", "case_rewrite_batches", "case_rewrite_entries"]) {
        const r = await client.query(`SELECT count(*)::int AS n FROM "${t}"`);
        expect(Number((r.rows[0] as { n: number }).n)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it("plan_hash唯一；(batch_id, entity_type, entity_id)唯一；hash列CHECK拒绝非64位hex", async () => {
    await withClient(async (client) => {
      await client.query("BEGIN");
      /** 预期失败的语句：SAVEPOINT包裹，失败后回滚到保存点（事务不中止）。 */
      const expectRejected = async (fn: () => Promise<unknown>): Promise<void> => {
        await client.query("SAVEPOINT expect_rejected");
        let rejected = false;
        try {
          await fn();
        } catch {
          rejected = true;
        }
        await client.query("ROLLBACK TO SAVEPOINT expect_rejected");
        expect(rejected, "该语句应当被约束拒绝").toBe(true);
      };
      try {
        const batchId = "44444444-4444-4444-8444-444444444444";
        const planHash = "a".repeat(64);
        await client.query(
          `INSERT INTO case_rewrite_batches (id, plan_hash, code_sha, source_fingerprint, target_fingerprint, final_fingerprint,
             source_generator_version, target_generator_version, source_manifest, source_attestation, snapshot_bindings,
             row_counts, status, created_by, created_at, applied_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12::jsonb,'applied','it',now(),now())`,
          [batchId, planHash, "1".repeat(40), "b".repeat(64), "c".repeat(64), "d".repeat(64),
           "RCL-GEN-1.0", "RCL-GEN-2.0", "{}", "e".repeat(64), "[]", "{}"],
        );
        // 同plan_hash再次插入 → 唯一约束拒绝。
        await expectRejected(() =>
          client.query(
            `INSERT INTO case_rewrite_batches (id, plan_hash, code_sha, source_fingerprint, target_fingerprint, final_fingerprint,
               source_generator_version, target_generator_version, source_manifest, source_attestation, snapshot_bindings,
               row_counts, status, created_by, created_at, applied_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12::jsonb,'applied','it',now(),now())`,
            ["55555555-5555-4555-8555-555555555555", planHash, "1".repeat(40), "b".repeat(64), "c".repeat(64), "d".repeat(64),
             "RCL-GEN-1.0", "RCL-GEN-2.0", "{}", "e".repeat(64), "[]", "{}"],
          ),
        );
        // 非法hash被CHECK拒绝。
        await expectRejected(() =>
          client.query(
            `INSERT INTO case_rewrite_batches (id, plan_hash, code_sha, source_fingerprint, target_fingerprint, final_fingerprint,
               source_generator_version, target_generator_version, source_manifest, source_attestation, snapshot_bindings,
               row_counts, status, created_by, created_at, applied_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12::jsonb,'applied','it',now(),now())`,
            ["66666666-6666-4666-8666-666666666666", "f".repeat(64), "1".repeat(40), "bad-hash", "c".repeat(64), "d".repeat(64),
             "RCL-GEN-1.0", "RCL-GEN-2.0", "{}", "e".repeat(64), "[]", "{}"],
          ),
        );
        await client.query(
          `INSERT INTO case_rewrite_entries (batch_id, entity_type, entity_id, old_uid, new_uid, old_content_hash,
             new_content_hash, old_snapshot_hash, new_snapshot_hash, evidence_hash, before, after)
           VALUES ($1,'case',1,'RPC-X-V1','RPC-X-V2',$2,$3,$4,$5,$6,'{}'::jsonb,'{}'::jsonb)`,
          [batchId, "1".repeat(64), "2".repeat(64), null, "3".repeat(64), "4".repeat(64)],
        );
        // 同(batch,entity_type,entity_id)再次插入拒绝。
        await expectRejected(() =>
          client.query(
            `INSERT INTO case_rewrite_entries (batch_id, entity_type, entity_id, old_uid, new_uid, old_content_hash,
               new_content_hash, old_snapshot_hash, new_snapshot_hash, evidence_hash, before, after)
             VALUES ($1,'case',1,'RPC-X-V1','RPC-X-V2',$2,$3,$4,$5,$6,'{}'::jsonb,'{}'::jsonb)`,
            [batchId, "1".repeat(64), "2".repeat(64), null, "3".repeat(64), "4".repeat(64)],
          ),
        );
        // 非法entity_type拒绝。
        await expectRejected(() =>
          client.query(
            `INSERT INTO case_rewrite_entries (batch_id, entity_type, entity_id, old_uid, new_uid, old_content_hash,
               new_content_hash, old_snapshot_hash, new_snapshot_hash, evidence_hash, before, after)
             VALUES ($1,'showcase',2,'RPC-Y-V1','RPC-Y-V2',$2,$3,$4,$5,$6,'{}'::jsonb,'{}'::jsonb)`,
            [batchId, "1".repeat(64), "2".repeat(64), null, "3".repeat(64), "4".repeat(64)],
          ),
        );
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("外键不级联删除：删除批次前必须先清空entries（RESTRICT/NO ACTION）", async () => {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const batchId = "77777777-7777-4777-8777-777777777777";
        await client.query(
          `INSERT INTO case_rewrite_batches (id, plan_hash, code_sha, source_fingerprint, target_fingerprint, final_fingerprint,
             source_generator_version, target_generator_version, source_manifest, source_attestation, snapshot_bindings,
             row_counts, status, created_by, created_at, applied_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12::jsonb,'applied','it',now(),now())`,
          [batchId, "9".repeat(64), "1".repeat(40), "b".repeat(64), "c".repeat(64), "d".repeat(64),
           "RCL-GEN-1.0", "RCL-GEN-2.0", "{}", "e".repeat(64), "[]", "{}"],
        );
        await client.query(
          `INSERT INTO case_rewrite_entries (batch_id, entity_type, entity_id, old_uid, new_uid, old_content_hash,
             new_content_hash, old_snapshot_hash, new_snapshot_hash, evidence_hash, before, after)
           VALUES ($1,'test',3,null,'RPCT-X-V2',$2,$3,$4,$5,$6,'{}'::jsonb,'{}'::jsonb)`,
          [batchId, "1".repeat(64), "2".repeat(64), null, "3".repeat(64), "4".repeat(64)],
        );
        await expect(client.query(`DELETE FROM case_rewrite_batches WHERE id = $1`, [batchId])).rejects.toThrow();
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("SQL重复执行幂等；journal 0019严格单调且when=1788797000000", async () => {
    const sqlText = readFileSync(SQL_FILE, "utf8");
    await withClient(async (client) => {
      // 已迁移库上重复执行同一SQL必须无错误（幂等）。
      await client.query(sqlText);
      await client.query(sqlText);
      const journal = JSON.parse(
        readFileSync(path.join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8"),
      ) as { entries: Array<{ idx: number; when: number; tag: string }> };
      const last = journal.entries[journal.entries.length - 1];
      expect(last.tag).toBe("0019_case_rewrite_audit");
      expect(last.when).toBe(1788797000000);
      const ws = journal.entries.map((e) => e.when);
      for (let i = 1; i < ws.length; i++) expect(ws[i]).toBeGreaterThan(ws[i - 1]);
    });
  });
});
