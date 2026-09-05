/**
 * 09-05 SDL-FR-011/012/013、SDL-NFR-005/006、SDL-AC-007：
 * 0010版本化migration行为测试——dsl_version已知旧值规范化、粤川六条示例精确清理、
 * 未知值/非预期目标/引用存在时中止、重复执行幂等。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已执行全部migration的全新 PostgreSQL 17 库；
 * 未设置时直接失败（不允许skip，SDL-AC-009）。测试在事务内执行migration SQL并回滚，
 * 不污染演练库；快照成员表仅SELECT（不可变触发器禁止改写，SDL-NFR-005）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

const MIGRATION_FILE = path.join(
  process.cwd(),
  "drizzle/0010_sdl_dsl_normalization_example_cleanup.sql",
);

const EXAMPLE_PARAM_IDS = [
  "P-GD-MIN-WAGE-BASE",
  "P-GD-MEDICAL-CAP",
  "P-SC-MIN-WAGE-BASE",
  "P-SC-MEDICAL-CAP",
];
const EXAMPLE_PACK_IDS = ["GD-EXAMPLE-BASE", "SC-EXAMPLE-BASE"];
const EXAMPLE_BUSINESS_KEYS = [...EXAMPLE_PACK_IDS, ...EXAMPLE_PARAM_IDS];

async function withClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: DRILL_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** 事务内准备数据→执行migration→断言→回滚；期望失败时捕获异常并回滚。 */
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

async function insertRule(
  client: Client,
  dslVersion: string,
  ruleId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO rules (rule_id, jurisdiction_code, business_key, name, module,
       dsl_version, priority, status, effective_from, decision_table)
     VALUES ($1, '310000', $1, $1, 'test', $2, 1, 'published', '2024-01-01', '{"hit_policy":"first","rows":[]}'::jsonb)`,
    [ruleId, dslVersion],
  );
}

async function insertExampleRows(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO policy_pack_versions (policy_pack_id, jurisdiction_code, pack_kind, version, status, effective_from)
     VALUES ('GD-EXAMPLE-BASE','440000','overlay',1,'published','2025-01-01'),
            ('SC-EXAMPLE-BASE','510000','overlay',1,'published','2025-01-01')`,
  );
  await client.query(
    `INSERT INTO params (policy_pack_id, jurisdiction_code, business_key, param_id, type, value, effective_from, status)
     VALUES ('GD-EXAMPLE-BASE','440000','P-GD-MIN-WAGE-BASE','P-GD-MIN-WAGE-BASE','number','2300','2025-01-01','published'),
            ('GD-EXAMPLE-BASE','440000','P-GD-MEDICAL-CAP','P-GD-MEDICAL-CAP','number','7800','2025-01-01','published'),
            ('SC-EXAMPLE-BASE','510000','P-SC-MIN-WAGE-BASE','P-SC-MIN-WAGE-BASE','number','2100','2025-01-01','published'),
            ('SC-EXAMPLE-BASE','510000','P-SC-MEDICAL-CAP','P-SC-MEDICAL-CAP','number','6600','2025-01-01','published')`,
  );
}

async function insertControlRows(client: Client): Promise<void> {
  // 对照组：非示例业务键必须保持不变（SDL-NFR-005 最小删除）。
  // 使用SDL专属ID，避免与生产Seed写入的SHANGHAI_BASE/P-SH-*真实资产冲突。
  await client.query(
    `INSERT INTO policy_pack_versions (policy_pack_id, jurisdiction_code, pack_kind, version, status, effective_from)
     VALUES ('SDL-CONTROL-PACK','310000','baseline',1,'published','2025-01-01')`,
  );
  await client.query(
    `INSERT INTO params (policy_pack_id, jurisdiction_code, business_key, param_id, type, value, effective_from, status)
     VALUES ('SDL-CONTROL-PACK','310000','P-SDL-CONTROL-PARAM','P-SDL-CONTROL-PARAM','number','7460','2025-07-01','published')`,
  );
}

async function count(client: Client, sql: string): Promise<string> {
  const res = await client.query<{ n: string }>(sql);
  return res.rows[0].n;
}

describe("0010 migration（drill DB，SDL-AC-007）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已执行全部migration的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
  });

  it("migration已登记于drizzle journal（SDL-FR-011 版本化）", () => {
    const journal = JSON.parse(
      readFileSync(path.join(process.cwd(), "drizzle/meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string }> };
    expect(journal.entries.some((e) => e.tag === "0010_sdl_dsl_normalization_example_cleanup"))
      .toBe(true);
  });

  it("已知旧值SSP-DSL-1.0与ssp_dsl_v1规范化为SOCILA-DSL-1.0（SDL-FR-011）", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        await insertRule(c, "SSP-DSL-1.0", "R-TEST-OLD-UPPER");
        await insertRule(c, "ssp_dsl_v1", "R-TEST-OLD-DIR");
        await insertRule(c, "SOCILA-DSL-1.0", "R-TEST-ALREADY-NEW");
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));

        const res = await c.query<{ dsl_version: string }>(
          `SELECT dsl_version FROM rules WHERE rule_id LIKE 'R-TEST-%' ORDER BY rule_id`,
        );
        expect(res.rows.map((r) => r.dsl_version)).toEqual([
          "SOCILA-DSL-1.0",
          "SOCILA-DSL-1.0",
          "SOCILA-DSL-1.0",
        ]);
      });
    });
  });

  it("未知dsl_version中止场景在真实事务中抛出（SDL-FR-011 fail-fast）", async () => {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await insertRule(client, "MYSTERY-DSL-1", "R-TEST-MYSTERY");
        let aborted: Error | null = null;
        try {
          await client.query(readFileSync(MIGRATION_FILE, "utf8"));
        } catch (err) {
          aborted = err as Error;
        }
        expect(aborted).not.toBeNull();
        expect(aborted?.message).toMatch(/dsl_version/);
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("恰好删除六条示例记录，其他数据不变（SDL-FR-012/013、NFR-005）", async () => {
    await withClient(async (client) => {
      await runInTx(client, async (c) => {
        await insertExampleRows(c);
        await insertControlRows(c);
        await c.query(readFileSync(MIGRATION_FILE, "utf8"));

        expect(await count(c, `SELECT count(*) AS n FROM policy_pack_versions WHERE policy_pack_id IN ('GD-EXAMPLE-BASE','SC-EXAMPLE-BASE')`))
          .toBe("0");
        expect(await count(c, `SELECT count(*) AS n FROM params WHERE param_id IN ('P-GD-MIN-WAGE-BASE','P-GD-MEDICAL-CAP','P-SC-MIN-WAGE-BASE','P-SC-MEDICAL-CAP')`))
          .toBe("0");

        expect(await count(c, `SELECT count(*) AS n FROM policy_pack_versions WHERE policy_pack_id = 'SDL-CONTROL-PACK'`))
          .toBe("1");
        expect(await count(c, `SELECT count(*) AS n FROM params WHERE param_id = 'P-SDL-CONTROL-PARAM'`))
          .toBe("1");
      });
    });
  });

  it("额外版本的示例包视为不一致并中止（SDL-FR-013）", async () => {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await insertExampleRows(client);
        await client.query(
          `INSERT INTO policy_pack_versions (policy_pack_id, jurisdiction_code, pack_kind, version, status, effective_from)
           VALUES ('GD-EXAMPLE-BASE','440000','overlay',2,'draft','2026-01-01')`,
        );
        // SAVEPOINT内执行migration：RAISE EXCEPTION后可回滚到保存点继续断言现场。
        await client.query("SAVEPOINT sdl_migration_attempt");
        let aborted: Error | null = null;
        try {
          await client.query(readFileSync(MIGRATION_FILE, "utf8"));
        } catch (err) {
          aborted = err as Error;
        }
        expect(aborted).not.toBeNull();
        expect(aborted?.message).toMatch(/policy_pack_versions|不一致|GD-EXAMPLE-BASE/);
        await client.query("ROLLBACK TO SAVEPOINT sdl_migration_attempt");
        const res = await client.query<{ n: string }>(
          `SELECT count(*) AS n FROM params WHERE param_id = 'P-GD-MIN-WAGE-BASE'`,
        );
        expect(res.rows[0].n).toBe("1");
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("非预期地区的示例参数视为不一致并中止（SDL-FR-013）", async () => {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await insertExampleRows(client);
        // P-GD-MIN-WAGE-BASE 出现在非预期地区 → 中止。
        await client.query(
          `INSERT INTO params (policy_pack_id, jurisdiction_code, business_key, param_id, type, value, effective_from, status)
           VALUES ('GD-EXAMPLE-BASE','510000','P-GD-MIN-WAGE-BASE','P-GD-MIN-WAGE-BASE','number','1','2025-01-01','draft')`,
        );
        let aborted: Error | null = null;
        try {
          await client.query(readFileSync(MIGRATION_FILE, "utf8"));
        } catch (err) {
          aborted = err as Error;
        }
        expect(aborted).not.toBeNull();
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("快照成员或冲突记录引用示例业务键时中止（SDL-FR-013、NFR-005）", async () => {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await insertExampleRows(client);
        const snap = await client.query<{ id: string }>(
          `INSERT INTO policy_snapshots (jurisdiction_code, as_of_date, resolved_path, content_hash, created_by)
           VALUES ('440000','2026-01-01','/CN/440000/','hash-sdl-test','sdl-test') RETURNING id`,
        );
        await client.query(
          `INSERT INTO policy_snapshot_members (snapshot_id, entity_type, business_key, payload, provenance)
           VALUES ($1,'param','P-GD-MIN-WAGE-BASE','{}'::jsonb,'[]'::jsonb)`,
          [snap.rows[0].id],
        );
        let aborted: Error | null = null;
        try {
          await client.query(readFileSync(MIGRATION_FILE, "utf8"));
        } catch (err) {
          aborted = err as Error;
        }
        expect(aborted).not.toBeNull();
        expect(aborted?.message).toMatch(/snapshot|引用/);
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("重复执行无新增变化（幂等，PRD §9.4）", async () => {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await insertRule(client, "SSP-DSL-1.0", "R-TEST-IDEM");
        await insertExampleRows(client);
        const migrationSql = readFileSync(MIGRATION_FILE, "utf8");
        await client.query(migrationSql);
        const afterFirst = await client.query<{ n: string }>(
          `SELECT count(*) AS n FROM rules WHERE rule_id = 'R-TEST-IDEM' AND dsl_version = 'SOCILA-DSL-1.0'`,
        );
        const packsAfterFirst = await client.query<{ n: string }>(
          `SELECT count(*) AS n FROM policy_pack_versions`,
        );
        await client.query(migrationSql);
        const afterSecond = await client.query<{ n: string }>(
          `SELECT count(*) AS n FROM rules WHERE rule_id = 'R-TEST-IDEM' AND dsl_version = 'SOCILA-DSL-1.0'`,
        );
        const packsAfterSecond = await client.query<{ n: string }>(
          `SELECT count(*) AS n FROM policy_pack_versions`,
        );
        expect(afterSecond.rows[0].n).toBe(afterFirst.rows[0].n);
        expect(packsAfterSecond.rows[0].n).toBe(packsAfterFirst.rows[0].n);
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("业务键清单与固定目标一致（SDL-FR-013 防御性契约）", () => {
    expect(EXAMPLE_BUSINESS_KEYS).toEqual([
      "GD-EXAMPLE-BASE",
      "SC-EXAMPLE-BASE",
      "P-GD-MIN-WAGE-BASE",
      "P-GD-MEDICAL-CAP",
      "P-SC-MIN-WAGE-BASE",
      "P-SC-MEDICAL-CAP",
    ]);
  });
});
