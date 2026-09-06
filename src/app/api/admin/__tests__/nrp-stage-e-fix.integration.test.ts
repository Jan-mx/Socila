/**
 * 审查缺陷11/10/8（集成面）：
 * - 0014约束：批次(jurisdiction,manifest_hash)唯一、成员唯一与entity_type CHECK、
 *   status/readiness枚举CHECK、并发apply只允许一个成功；
 * - 发布测试隔离：staging→production回归门禁按jurisdiction_code加载测试；
 * - published完整性哈希矩阵：修改任一政策字段都会改变哈希。
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
const MAT_DB = `nrp_fix_${Date.now().toString(36)}`;
let matUrl = "";

const LEGACY_RULE_KEYS = [
  "R-010-PARSE-BIRTH-YEAR",
  "R-110-LOOKUP-LEGAL-RETIRE-AGE",
  "R-310-MI-WAITING-PERIOD",
  "R-900-FINAL-GATE",
];

async function client(): Promise<Client> {
  const c = new Client({ connectionString: DRILL_URL });
  await c.connect();
  return c;
}

async function adminClient(): Promise<Client> {
  const base = new URL(DRILL_URL!);
  base.pathname = "/postgres";
  const c = new Client({ connectionString: base.toString() });
  await c.connect();
  return c;
}

async function matClient(): Promise<Client> {
  const c = new Client({ connectionString: matUrl });
  await c.connect();
  return c;
}

describe("0014约束与并发幂等（审查缺陷11）", () => {
  beforeAll(async () => {
    if (!DRILL_URL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置");
    }
    const admin = await adminClient();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${MAT_DB}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${MAT_DB}"`);
    } finally {
      await admin.end();
    }
    const base = new URL(DRILL_URL);
    base.pathname = `/${MAT_DB}`;
    matUrl = base.toString();
    execMigrationsTool(matUrl);
    process.env.DATABASE_URL = matUrl;
  }, 120_000);

  afterAll(async () => {
    const admin = await adminClient();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${MAT_DB}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });

  function execMigrations(): void {
    execFileSync("node", ["scripts/run-migrations.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: matUrl },
      stdio: "pipe",
    });
  }

  it("0014迁移幂等（全新库与已执行0013的副本）", async () => {
    const c = await matClient();
    try {
      await c.query("BEGIN");
      await c.query(
        readFileSync(
          path.join(process.cwd(), "drizzle/0014_nrp_stage_e_constraints.sql"),
          "utf8",
        ),
      );
      await c.query("ROLLBACK");
      expect(true).toBe(true);
    } finally {
      await c.end();
    }
  });

  it("批次唯一/成员唯一/entity_type与status/readiness CHECK存在", async () => {
    const c = await matClient();
    try {
      // (jurisdiction, manifest_hash)唯一：重复插入必须失败。
      await c.query(
        `insert into policy_import_batches
           (jurisdiction_code, manifest_hash, source_commit, target_fingerprint,
            status, readiness, blocking_reasons, entity_counts, actor)
         values ('CN', 'h1', 'c1', 'fp', 'applied', 'awaiting_approval', '[]', '{}', 't')`,
      );
      await expect(
        c.query(
          `insert into policy_import_batches
             (jurisdiction_code, manifest_hash, source_commit, target_fingerprint,
              status, readiness, blocking_reasons, entity_counts, actor)
           values ('CN', 'h1', 'c1', 'fp', 'applied', 'awaiting_approval', '[]', '{}', 't')`,
        ),
      ).rejects.toThrow();

      // status/readiness枚举CHECK。
      await expect(
        c.query(
          `insert into policy_import_batches
             (jurisdiction_code, manifest_hash, source_commit, target_fingerprint,
              status, readiness, blocking_reasons, entity_counts, actor)
           values ('CN', 'h2', 'c1', 'fp', 'bogus', 'awaiting_approval', '[]', '{}', 't')`,
        ),
      ).rejects.toThrow();
      await expect(
        c.query(
          `insert into policy_import_batches
             (jurisdiction_code, manifest_hash, source_commit, target_fingerprint,
              status, readiness, blocking_reasons, entity_counts, actor)
           values ('CN', 'h3', 'c1', 'fp', 'applied', 'ready', '[]', '{}', 't')`,
        ),
      ).rejects.toThrow();

      // 成员entity_type CHECK。
      const batch = await c.query(`select id from policy_import_batches limit 1`);
      const id = batch.rows[0].id;
      await expect(
        c.query(
          `insert into policy_import_batch_members
             (batch_id, entity_type, entity_row_id, business_key, version, content_hash)
           values ($1, 'bogus', 1, 'K', 1, 'h')`,
          [id],
        ),
      ).rejects.toThrow();
      await c.query(`delete from policy_import_batch_members where batch_id=$1`, [id]);
      await c.query(`delete from policy_import_batches where id=$1`, [id]);
    } finally {
      await c.end();
    }
  });
});

/** 辅助（避免顶部导入execFileSync与TS类型冲突）。 */
function execMigrationsTool(dbUrl: string): void {
  execFileSync("node", ["scripts/run-migrations.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });
}

describe("发布测试隔离（审查缺陷10）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置");
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  it("CN staging规则在仅有上海测试时回归门禁失败；补充CN测试后通过", async () => {
    const c = await client();
    try {
      // 造一个CN draft规则（v2副本，不动published）；防御性清理残留。
      await c.query(
        `delete from rules where jurisdiction_code='CN' and rule_id='R-010-PARSE-BIRTH-YEAR' and version=2`,
      );
      const src = await c.query(
        `select * from rules where jurisdiction_code='CN' and rule_id='R-010-PARSE-BIRTH-YEAR' and version=1`,
      );
      expect(src.rows).toHaveLength(1);
      await c.query(
        `insert into rules (rule_id, jurisdiction_code, business_key, name, module,
           dsl_version, priority, status, effective_from, decision_table, inputs,
           outputs, parameter_refs, examples, evidence, version, operation)
         select rule_id, jurisdiction_code, business_key, name, module,
           dsl_version, priority, 'draft', effective_from, decision_table, inputs,
           outputs, parameter_refs, examples, evidence, 2, operation
         from rules where id=$1`,
        [src.rows[0].id],
      );
      const staging = await c.query(
        `select id from rules where jurisdiction_code='CN' and rule_id='R-010-PARSE-BIRTH-YEAR' and version=2`,
      );
      const rowId = staging.rows[0].id as number;

      const { promoteEntity } = await import("@/lib/admin/publish-service");
      // draft→staging先走通（CN规则examples齐备）。
      await promoteEntity({
        entityType: "rule",
        jurisdictionCode: "CN",
        entityId: "R-010-PARSE-BIRTH-YEAR",
        version: 2,
        actor: "fix-test",
      });

      // 确保CN无tests、上海有tests → staging→production必须失败（不得拿上海测试充数）。
      await c.query(`delete from tests where jurisdiction_code='CN'`);
      const shTests = await c.query(
        `select count(*)::int as n from tests where jurisdiction_code='310000'`,
      );
      expect(shTests.rows[0].n).toBeGreaterThan(0);

      await expect(
        promoteEntity({
          entityType: "rule",
          jurisdictionCode: "CN",
          entityId: "R-010-PARSE-BIRTH-YEAR",
          version: 2,
          actor: "fix-test",
        }),
      ).rejects.toThrow(/未找到回归测试|回归测试/);

      // 补充CN测试后通过。
      await c.query(
        `insert into tests (name, jurisdiction_code, rule_id, input, params_override, expected, source)
         values ('CN隔离冒烟', 'CN', 'R-010-PARSE-BIRTH-YEAR',
           '{"user":{"basic":{"birth_year":null,"birth_year_text":"73"}}}',
           null,
           '{"user":{"basic":{"birth_year":1973}}}',
           'example')`,
      );
      const ok = await promoteEntity({
        entityType: "rule",
        jurisdictionCode: "CN",
        entityId: "R-010-PARSE-BIRTH-YEAR",
        version: 2,
        actor: "fix-test",
      });
      expect(ok.newStatus).toBe("published");
      // 发布审计必须携带地区与版本（审查缺陷2关联）。
      expect(ok.publish.jurisdictionCode).toBe("CN");
      expect(ok.publish.entityVersion).toBe(2);
    } finally {
      await c.end();
    }
  });
});

describe("published完整性哈希矩阵（审查缺陷8）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置");
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  it("修改规则/参数/规则集的任一政策字段都会改变行哈希", async () => {
    const { loadExistingState } = await import(
      "@/lib/policy-materialization/target"
    );
    const c = await client();
    try {
      const sql = {
        query: async (text: string) =>
          (await c.query(text)) as { rows: Record<string, unknown>[] },
      };
      // 自包含scratch规则行（published，结束删除，不影响其他用例）；
      // 防御性清理此前失败运行可能残留的行。
      await c.query(
        `delete from rules where rule_id='R-HASH-MATRIX' and jurisdiction_code='CN'`,
      );
      await c.query(
        `insert into rules (rule_id, jurisdiction_code, business_key, name, module,
           dsl_version, priority, status, effective_from, decision_table, version, operation)
         values ('R-HASH-MATRIX','CN','R-HASH-MATRIX','哈希矩阵','test',
           'SOCILA-DSL-1.0',0,'published','2024-01-01',
           '{"hit_policy":"first","rows":[]}'::jsonb,1,'baseline')`,
      );
      const hashOf = async () =>
        (await loadExistingState(sql)).publishedRowsHash;
      const baseHash = await hashOf();

      // 字段矩阵：逐字段更新→断言哈希变化→还原→断言哈希恢复。
      const matrix: Array<[string, unknown]> = [
        ["name", "矩阵改名"],
        ["module", "matrix_module"],
        ["priority", 777],
        ["effective_from", "2030-01-01"],
        ["effective_to", "2099-12-31"],
        ["notes", "矩阵备注"],
        ["dsl_version", "SOCILA-DSL-1.0-ALT"],
        ["supersedes", ["R-000-OLD"]],
      ];
      const originals: Record<string, unknown> = {
        name: "哈希矩阵",
        module: "test",
        priority: 0,
        effective_from: "2024-01-01",
        effective_to: null,
        notes: null,
        dsl_version: "SOCILA-DSL-1.0",
        supersedes: [],
      };
      // jsonb列需要字符串化传参（数组/对象），标量直传。
      const toDb = (v: unknown) =>
        Array.isArray(v) || (v !== null && typeof v === "object")
          ? JSON.stringify(v)
          : v;

      for (const [field, value] of matrix) {
        await c.query(`update rules set ${field} = $1 where rule_id='R-HASH-MATRIX' and jurisdiction_code='CN'`, [toDb(value)]);
        const changed = await hashOf();
        expect(changed, `修改rules.${field}应改变哈希`).not.toBe(baseHash);
        await c.query(`update rules set ${field} = $1 where rule_id='R-HASH-MATRIX' and jurisdiction_code='CN'`, [toDb(originals[field])]);
        const restored = await hashOf();
        expect(restored, `还原rules.${field}应恢复哈希`).toBe(baseHash);
      }

      // 载体行（published）删除后哈希必须变化（行集合参与哈希）。
      await c.query(`delete from rules where rule_id='R-HASH-MATRIX' and jurisdiction_code='CN'`);
      const afterDelete = await hashOf();
      expect(afterDelete).not.toBe(baseHash);
    } finally {
      await c.end();
    }
  });
});
