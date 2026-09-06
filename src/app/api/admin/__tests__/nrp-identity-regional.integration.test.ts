/**
 * 审查缺陷5/6/2（集成面）：地区精确身份与编辑白名单的路由级验证。
 * 直接以NextRequest调用route handler（与draft-imports路由测试同模式）。
 *
 * 场景基线（drill库Seed后）：
 * - CN draft v1的R-110与SH published v1的R-110同名不同载荷；
 * - 广东/四川draft blocked；
 * - CN/沪各有published参数。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

async function client(): Promise<Client> {
  const c = new Client({ connectionString: DRILL_URL });
  await c.connect();
  return c;
}

function jsonRequest(
  url: string,
  method: string,
  body?: unknown,
): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("地区精确身份与编辑白名单（路由级，审查缺陷5/6/2）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置（CI database-gates 自动提供）");
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  it("规则详情：缺失jurisdiction_code/version返回400；错误版本404；同名不串区", async () => {
    // 同名跨地区夹具：重分类后SH已无R-110，插入published v1构造CN/SH同名场景。
    const cf = await client();
    try {
      await cf.query(
        "delete from rules where jurisdiction_code='310000' and rule_id='R-110-LOOKUP-LEGAL-RETIRE-AGE'",
      );
      await cf.query(
        `insert into rules (rule_id, jurisdiction_code, business_key, name, module,
           dsl_version, priority, status, effective_from, decision_table, version, operation)
         values ('R-110-LOOKUP-LEGAL-RETIRE-AGE','310000','R-110-LOOKUP-LEGAL-RETIRE-AGE',
           'SH同名副本','test','SOCILA-DSL-1.0',110,'published','2024-01-01',
           '{"hit_policy":"first","rows":[]}'::jsonb,1,'add')`,
      );
    } finally {
      await cf.end();
    }

    // 防御清理：此前失败运行可能残留的CN v2行（published/staging）。
    const c0 = await client();
    try {
      await c0.query(
        "delete from rules where jurisdiction_code='CN' and rule_id='R-010-PARSE-BIRTH-YEAR' and version=2",
      );
    } finally {
      await c0.end();
    }
    const { GET } = await import(
      "@/app/api/admin/rules/[ruleId]/route"
    );

    // 缺失身份 → 400。
    const missing = await GET(
      jsonRequest("/api/admin/rules/R-110-LOOKUP-LEGAL-RETIRE-AGE", "GET"),
      { params: Promise.resolve({ ruleId: "R-110-LOOKUP-LEGAL-RETIRE-AGE" }) },
    );
    expect(missing.status).toBe(400);

    // CN存在（draft v1）→ 200且jurisdiction正确。
    const cn = await GET(
      jsonRequest(
        "/api/admin/rules/R-110-LOOKUP-LEGAL-RETIRE-AGE?jurisdiction_code=CN&version=1",
        "GET",
      ),
      { params: Promise.resolve({ ruleId: "R-110-LOOKUP-LEGAL-RETIRE-AGE" }) },
    );
    expect(cn.status).toBe(200);
    const cnBody = (await cn.json()) as { rule: { jurisdictionCode: string | null } };
    expect(cnBody.rule.jurisdictionCode).toBe("CN");

    // 错误版本 → 404。
    const wrongVersion = await GET(
      jsonRequest(
        "/api/admin/rules/R-110-LOOKUP-LEGAL-RETIRE-AGE?jurisdiction_code=CN&version=9",
        "GET",
      ),
      { params: Promise.resolve({ ruleId: "R-110-LOOKUP-LEGAL-RETIRE-AGE" }) },
    );
    expect(wrongVersion.status).toBe(404);

    // 同名SH published v1存在且jurisdiction=310000（不串区）。
    const sh = await GET(
      jsonRequest(
        "/api/admin/rules/R-110-LOOKUP-LEGAL-RETIRE-AGE?jurisdiction_code=310000&version=1",
        "GET",
      ),
      { params: Promise.resolve({ ruleId: "R-110-LOOKUP-LEGAL-RETIRE-AGE" }) },
    );
    expect(sh.status).toBe(200);
    const shBody = (await sh.json()) as { rule: { jurisdictionCode: string | null } };
    expect(shBody.rule.jurisdictionCode).toBe("310000");
  });

  it("规则PATCH：status字段出现即400且数据库不变（审查缺陷2）", async () => {
    const { PATCH } = await import("@/app/api/admin/rules/[ruleId]/route");
    const c = await client();
    try {
      const before = await c.query(
        `select status, version, name from rules
         where jurisdiction_code='CN' and rule_id='R-010-PARSE-BIRTH-YEAR' and version=1`,
      );
      const res = await PATCH(
        jsonRequest(
          "/api/admin/rules/R-010-PARSE-BIRTH-YEAR?jurisdiction_code=CN&version=1",
          "PATCH",
          { name: "改名", status: "published" },
        ),
        { params: Promise.resolve({ ruleId: "R-010-PARSE-BIRTH-YEAR" }) },
      );
      expect(res.status).toBe(400);

      const after = await c.query(
        `select status, name, version from rules
         where jurisdiction_code='CN' and rule_id='R-010-PARSE-BIRTH-YEAR' and version=1`,
      );
      expect(after.rows[0].status).toBe(before.rows[0].status);
      expect(after.rows[0].name).toBe(before.rows[0].name);

      // 版本/地区字段同样拒绝。
      const versionAttack = await PATCH(
        jsonRequest(
          "/api/admin/rules/R-010-PARSE-BIRTH-YEAR?jurisdiction_code=CN&version=1",
          "PATCH",
          { name: "改名2", version: 5 },
        ),
        { params: Promise.resolve({ ruleId: "R-010-PARSE-BIRTH-YEAR" }) },
      );
      expect(versionAttack.status).toBe(400);
      const jurisdictionAttack = await PATCH(
        jsonRequest(
          "/api/admin/rules/R-010-PARSE-BIRTH-YEAR?jurisdiction_code=CN&version=1",
          "PATCH",
          { name: "改名3", jurisdictionCode: "440000" },
        ),
        { params: Promise.resolve({ ruleId: "R-010-PARSE-BIRTH-YEAR" }) },
      );
      expect(jurisdictionAttack.status).toBe(400);
    } finally {
      await c.end();
    }
  });

  it("示例执行：使用getRuleExact——CN与SH同名规则不串区（审查缺陷5）", async () => {
    const { POST } = await import(
      "@/app/api/admin/rules/[ruleId]/run-example/route"
    );
    // 缺身份 → 400。
    const missing = await POST(
      jsonRequest("/api/admin/rules/R-110-LOOKUP-LEGAL-RETIRE-AGE/run-example", "POST", {
        example: { name: "x", input: {}, expected: {} },
      }),
      { params: Promise.resolve({ ruleId: "R-110-LOOKUP-LEGAL-RETIRE-AGE" }) },
    );
    expect(missing.status).toBe(400);

    // CN身份可执行（draft状态合法）。
    const cn = await POST(
      jsonRequest(
        "/api/admin/rules/R-110-LOOKUP-LEGAL-RETIRE-AGE/run-example?jurisdiction_code=CN&version=1",
        "POST",
        {
          example: {
            name: "覆盖表1973男",
            input: {
              user: {
                basic: { gender: "male", female_retire_type: "na", birth_year: 1973 },
              },
            },
            params: {
              "T-RETIREMENT-AGE-LOOKUP": [
                {
                  gender: "male",
                  female_retire_type: "na",
                  birth_year_min: 1900,
                  birth_year_max: 2100,
                  legal_retire_age_years: 60,
                },
              ],
            },
            expected: { calc: { retirement: { legal_retire_age_years: 60 } } },
          },
        },
      ),
      { params: Promise.resolve({ ruleId: "R-110-LOOKUP-LEGAL-RETIRE-AGE" }) },
    );
    expect(cn.status).toBe(200);

    // 错误版本 → 404。
    const wrong = await POST(
      jsonRequest(
        "/api/admin/rules/R-110-LOOKUP-LEGAL-RETIRE-AGE/run-example?jurisdiction_code=CN&version=42",
        "POST",
        { example: { name: "x", input: {}, expected: {} } },
      ),
      { params: Promise.resolve({ ruleId: "R-110-LOOKUP-LEGAL-RETIRE-AGE" }) },
    );
    expect(wrong.status).toBe(404);
  });

  it("参数详情/更新：缺失地区或版本返回400，错误版本404（审查缺陷6）", async () => {
    const { GET, PUT } = await import("@/app/api/admin/params/[paramId]/route");

    // 缺失version → 400（不得静默选择“该地区最新版本”）。
    const missingVersion = await GET(
      jsonRequest(
        "/api/admin/params/P-SH-MIN-WAGE?jurisdiction_code=310000",
        "GET",
      ),
      { params: Promise.resolve({ paramId: "P-SH-MIN-WAGE" }) },
    );
    expect(missingVersion.status).toBe(400);

    // 缺失jurisdiction → 400。
    const missingJur = await GET(
      jsonRequest("/api/admin/params/P-SH-MIN-WAGE?version=1", "GET"),
      { params: Promise.resolve({ paramId: "P-SH-MIN-WAGE" }) },
    );
    expect(missingJur.status).toBe(400);

    // 精确版本命中。
    const ok = await GET(
      jsonRequest(
        "/api/admin/params/P-SH-MIN-WAGE?jurisdiction_code=310000&version=1",
        "GET",
      ),
      { params: Promise.resolve({ paramId: "P-SH-MIN-WAGE" }) },
    );
    expect(ok.status).toBe(200);

    // 错误版本 → 404。
    const wrong = await GET(
      jsonRequest(
        "/api/admin/params/P-SH-MIN-WAGE?jurisdiction_code=310000&version=99",
        "GET",
      ),
      { params: Promise.resolve({ paramId: "P-SH-MIN-WAGE" }) },
    );
    expect(wrong.status).toBe(404);

    // PUT同样要求身份。
    const putMissing = await PUT(
      jsonRequest("/api/admin/params/P-SH-MIN-WAGE", "PUT", { note: "x" }),
      { params: Promise.resolve({ paramId: "P-SH-MIN-WAGE" }) },
    );
    expect(putMissing.status).toBe(400);
  });

  afterAll(async () => {
    // 清理同名夹具：SH R-110副本，避免污染其他测试文件（duplicate-add）。
    const c = await client();
    try {
      await c.query(
        "delete from rules where jurisdiction_code='310000' and rule_id='R-110-LOOKUP-LEGAL-RETIRE-AGE'",
      );
    } finally {
      await c.end();
    }
  });
});
