/**
 * APR-FR-017 + 迁移契约（集成面）：0020显示元数据迁移在旧库升级与全新库两种路径下：
 * - 旧行以实体编号回退命名，当前版本化DSL资产行获得人工中文名称/说明；
 * - name NOT NULL生效（新行缺名称被拒绝）；
 * - 编号、政策值、规则顺序、版本、状态、内容零修改；
 * - 重复执行幂等（no-op）。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
const SCRATCH_DB = `apr0020_${process.pid}_${Math.floor(Math.random() * 1e6)}`;

function serverUrl(dbName: string): string {
  const u = new URL(DRILL_URL as string);
  u.pathname = `/${dbName}`;
  return u.toString();
}

function buildTruncatedFolder(): string {
  const tmp = path.join(
    os.tmpdir(),
    `apr0020-migrations-${process.pid}-${Math.floor(Math.random() * 1e6)}`,
  );
  mkdirSync(path.join(tmp, "meta"), { recursive: true });
  const drizzleDir = path.join(process.cwd(), "drizzle");
  const journal = JSON.parse(
    readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> };
  const kept = journal.entries.filter((e) => !e.tag.startsWith("0020_"));
  writeFileSync(
    path.join(tmp, "meta/_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries: kept }, null, 2) + "\n",
    "utf8",
  );
  for (const entry of kept) {
    copyFileSync(
      path.join(drizzleDir, `${entry.tag}.sql`),
      path.join(tmp, `${entry.tag}.sql`),
    );
  }
  return tmp;
}

describe("0020显示元数据迁移（APR-FR-003/010/017）", () => {
  let scratchUrl: string;

  beforeAll(async () => {
    if (!DRILL_URL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置（CI database-gates 自动提供）");
    }
    const admin = new Client({ connectionString: DRILL_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${SCRATCH_DB}"`);
    await admin.end();
    scratchUrl = serverUrl(SCRATCH_DB);
  });

  afterAll(async () => {
    const admin = new Client({ connectionString: DRILL_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("旧库升级：回退命名→DSL人工名称补全→NOT NULL生效→幂等，政策内容零修改", async () => {
    const truncated = buildTruncatedFolder();
    try {
      const pool0 = new Pool({ connectionString: scratchUrl, max: 1 });
      await migrate(drizzle(pool0), { migrationsFolder: truncated });
      await pool0.end();

      // 模拟0020之前的旧库：raw SQL插入无name/description列的行。
      // 地区实体不得baseline（0012 CHECK），用add。
      const old = new Client({ connectionString: scratchUrl });
      await old.connect();
      try {
        await old.query(
          `insert into rule_sets (rule_set_id, jurisdiction_code, description, status,
             effective_from, rules, conflict_resolution, version, operation)
           values ('RS-SHANGHAI-PLAN-V1','310000','旧说明','published','2024-01-01',
             '["R-010-PARSE-BIRTH-YEAR","R-500-4050-ELIGIBILITY"]','{}'::jsonb,1,'add'),
             ('RS-FUTURE-LOCAL','510000',null,'draft','2024-01-01','[]'::jsonb,null,1,'add')`,
        );
        await old.query(
          `insert into params (policy_pack_id, jurisdiction_code, business_key, param_id,
             type, value, unit, effective_from, rows, note, version, status, operation)
           values ('SHANGHAI_BASE','310000','P-SH-MIN-WAGE','P-SH-MIN-WAGE',
             'number','2740'::jsonb,'yuan/month','2025-07-01',null,null,1,'published','add'),
             ('X-PACK','510000','P-FUTURE','P-FUTURE',
             'number','1'::jsonb,'x','2024-01-01',null,null,1,'draft','add')`,
        );
        const ruleSetRulesBefore = await old.query(
          "select rules::text as r from rule_sets where rule_set_id='RS-SHANGHAI-PLAN-V1'",
        );
        // 内容基线必须在升级前后一致。
        expect(ruleSetRulesBefore.rows[0].r).toBe(
          '["R-010-PARSE-BIRTH-YEAR", "R-500-4050-ELIGIBILITY"]',
        );
      } finally {
        await old.end();
      }

      // 升级到含0020的完整journal。
      const pool1 = new Pool({ connectionString: scratchUrl, max: 1 });
      await migrate(drizzle(pool1), {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });
      await pool1.end();

      const c = new Client({ connectionString: scratchUrl });
      await c.connect();
      try {
        // 当前版本化DSL资产行获得人工中文名称/说明（APR-FR-011）。
        const named = await c.query(
          "select name, description from rule_sets where rule_set_id='RS-SHANGHAI-PLAN-V1'",
        );
        expect(named.rows[0].name).toBe("上海规划主规则集");
        const param = await c.query(
          "select name, description from params where param_id='P-SH-MIN-WAGE'",
        );
        expect(param.rows[0].name).toBe("上海市月最低工资标准");
        expect(param.rows[0].description).toContain("最低工资");

        // 无法对应DSL的旧行以编号回退（FR-017名称待补充）。
        const fallback = await c.query(
          "select name from rule_sets where rule_set_id='RS-FUTURE-LOCAL'",
        );
        expect(fallback.rows[0].name).toBe("RS-FUTURE-LOCAL");
        const fallbackParam = await c.query(
          "select name, description from params where param_id='P-FUTURE'",
        );
        expect(fallbackParam.rows[0].name).toBe("P-FUTURE");
        expect(fallbackParam.rows[0].description).toBeNull();

        // 编号、规则顺序、版本、状态零修改。
        const ruleSetRulesAfter = await c.query(
          "select rules::text as r, version, status from rule_sets where rule_set_id='RS-SHANGHAI-PLAN-V1'",
        );
        expect(ruleSetRulesAfter.rows[0].r).toBe(
          '["R-010-PARSE-BIRTH-YEAR", "R-500-4050-ELIGIBILITY"]',
        );
        expect(ruleSetRulesAfter.rows[0].version).toBe(1);
        expect(ruleSetRulesAfter.rows[0].status).toBe("published");

        // NOT NULL生效：不带名称的新插入被拒绝。
        await expect(
          c.query(
            `insert into rule_sets (rule_set_id, jurisdiction_code, status, effective_from, rules, version)
             values ('RS-NO-NAME','CN','draft','2024-01-01','[]'::jsonb,1)`,
          ),
        ).rejects.toThrow(/not-null|rule_sets_name_not_null/i);
        await expect(
          c.query(
            `insert into params (policy_pack_id, jurisdiction_code, param_id, type, effective_from, version, status)
             values ('X','CN','P-NO-NAME','number','2024-01-01',1,'draft')`,
          ),
        ).rejects.toThrow(/not-null|params_name_not_null/i);

        // 幂等：0020 SQL重复执行（含事务内重放）安全；完整migrate第二次no-op。
        const sqlText = readFileSync(
          path.join(process.cwd(), "drizzle/0020_apr_display_names.sql"),
          "utf8",
        );
        expect(sqlText.includes("\r\n")).toBe(false);
        await c.query("begin");
        await c.query(sqlText);
        await c.query("commit");
        const again = await c.query(
          "select name from rule_sets where rule_set_id='RS-SHANGHAI-PLAN-V1'",
        );
        expect(again.rows[0].name).toBe("上海规划主规则集");

        const pool2 = new Pool({ connectionString: scratchUrl, max: 1 });
        await migrate(drizzle(pool2), {
          migrationsFolder: path.join(process.cwd(), "drizzle"),
        });
        await pool2.end();
        const ledger = await c.query(
          "select count(*)::int as n from drizzle.__drizzle_migrations",
        );
        expect(ledger.rows[0].n).toBeGreaterThanOrEqual(20);
      } finally {
        await c.end();
      }
    } finally {
      rmSync(truncated, { recursive: true, force: true });
    }
  }, 180_000);
});
