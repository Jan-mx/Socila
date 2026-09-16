/**
 * APR-FR-010/012/015/016（集成面）：参数管理展示字段与发布中心/历史名称解析。
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

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

interface ReferencingRule {
  ruleId: string;
  name: string;
  jurisdictionCode: string | null;
}

interface AdminParamRow {
  paramId: string;
  name: string;
  description: string | null;
  jurisdictionCode: string | null;
  version: number;
  referencedByRules: ReferencingRule[];
}

interface PipelineBody {
  draft: Array<{ entityType: string; entityId: string; displayName: string | null }>;
  staging: Array<{ entityType: string; entityId: string; displayName: string | null }>;
  prod: Array<{ entityType: string; entityId: string; displayName: string | null }>;
}

interface HistoryRow {
  entityType: string;
  entityId: string;
  jurisdictionCode: string | null;
  entityVersion: number | null;
  displayName: string | null;
}

describe("参数与发布名称可读化（APR-FR-012/015/016，路由级）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置（CI database-gates 自动提供）");
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  afterAll(async () => {
    const c = await client();
    try {
      await c.query(
        "delete from publishes where entity_id like 'APR-TEST-%' or (entity_id='P-SH-MIN-WAGE' and jurisdiction_code='310000' and reason like 'apr-test%')",
      );
      await c.query(
        "delete from params where jurisdiction_code='CN' and param_id='APR-TEST-PARAM'",
      );
    } finally {
      await c.end();
    }
  });

  it("参数列表以中文名称为主并携带说明与批量引用规则（APR-FR-012/AC-008）", async () => {
    const { GET } = await import("@/app/api/admin/params/route");
    const res = await GET(
      jsonRequest("/api/admin/params?jurisdiction_code=310000", "GET"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { params: AdminParamRow[] };
    const wage = body.params.find((p) => p.paramId === "P-SH-MIN-WAGE" && p.version === 1);
    expect(wage?.name).toBe("上海市月最低工资标准");
    expect(wage?.description).toContain("最低工资");

    // 引用规则来自参数引用反查（R-510引用补贴比例参数）。
    const rate = body.params.find(
      (p) => p.paramId === "P-SH-4050-SUBSIDY-RATE" && p.version === 1,
    );
    expect(rate).toBeTruthy();
    expect(
      rate?.referencedByRules.some((r) => r.ruleId === "R-510-4050-AMOUNT"),
    ).toBe(true);
    // 引用规则名称同样为中文（来自rules.name）。
    const refRule = rate?.referencedByRules.find(
      (r) => r.ruleId === "R-510-4050-AMOUNT",
    );
    expect(refRule?.name).toBeTruthy();

    // 引用按参数行地区链过滤（Minor修复）：@310000参数只可被CN/310000规则引用。
    const male = body.params.find(
      (p) => p.paramId === "P-MI-LIFETIME-MALE-YEARS" && p.jurisdictionCode === "310000",
    );
    // Seed必然装载上海地区参数行；条件跳过会掩盖回归，钉住行存在。
    expect(male).toBeTruthy();
    expect(
      male!.referencedByRules.every(
        (r) => r.jurisdictionCode === "CN" || r.jurisdictionCode === "310000",
      ),
    ).toBe(true);
  });
  it("修复轮M-B1：draft/retired规则不进入参数引用列表（仅published参与反查）", async () => {
    const { Client } = await import("pg");
    const c = new Client({ connectionString: DRILL_URL });
    await c.connect();
    const draftRule = "R-APR-REF-DRAFT";
    try {
      await c.query(
        `delete from rules where rule_id=$1`,
        [draftRule],
      );
      await c.query(
        `insert into rules (rule_id, jurisdiction_code, business_key, name, module,
           dsl_version, priority, status, version, effective_from, operation,
           parameter_refs, decision_table)
         values ($1, '310000', $1, 'APR引用反查草稿规则', 'test', 'SOCILA-DSL-1.0', 1,
           'draft', 1, '2024-01-01', 'add', '["P-SH-4050-SUBSIDY-RATE"]'::jsonb,
           '{"hit_policy":"first","rows":[]}'::jsonb)`,
        [draftRule],
      );
      const { GET } = await import("@/app/api/admin/params/route");
      const res = await GET(
        jsonRequest("/api/admin/params?jurisdiction_code=310000", "GET"),
      );
      const body = (await res.json()) as { params: AdminParamRow[] };
      const rate = body.params.find(
        (p) => p.paramId === "P-SH-4050-SUBSIDY-RATE" && p.version === 1,
      );
      expect(
        rate?.referencedByRules.some((r) => r.ruleId === draftRule),
      ).toBe(false);
      // 翻转为published后必须出现（判别力：过滤确实由status驱动）。
      await c.query(
        `update rules set status='published' where rule_id=$1`,
        [draftRule],
      );
      const res2 = await GET(
        jsonRequest("/api/admin/params?jurisdiction_code=310000", "GET"),
      );
      const body2 = (await res2.json()) as { params: AdminParamRow[] };
      const rate2 = body2.params.find(
        (p) => p.paramId === "P-SH-4050-SUBSIDY-RATE" && p.version === 1,
      );
      expect(
        rate2?.referencedByRules.some((r) => r.ruleId === draftRule),
      ).toBe(true);
    } finally {
      await c.query(`delete from rules where rule_id=$1`, [draftRule]);
      await c.end();
    }
  });

  it("POST创建参数缺少正式名称返回400（APR-FR-017）", async () => {
    const { POST } = await import("@/app/api/admin/params/route");
    const res = await POST(
      jsonRequest("/api/admin/params", "POST", {
        paramId: "APR-TEST-PARAM",
        policyPackId: "CN-BASELINE",
        jurisdictionCode: "CN",
        type: "number",
        value: 1,
        effectiveFrom: "2024-01-01",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH参数name/description：空名、HTML尖括号拒绝且零写入；合法说明可更新（APR-FR-010/§9）", async () => {
    const { POST } = await import("@/app/api/admin/params/route");
    const { PATCH } = await import("@/app/api/admin/params/[paramId]/route");
    const created = await POST(
      jsonRequest("/api/admin/params", "POST", {
        paramId: "APR-TEST-DRAFT-PARAM",
        policyPackId: "CN-BASELINE",
        jurisdictionCode: "CN",
        name: "APR草稿测试参数",
        type: "number",
        value: 1,
        effectiveFrom: "2024-01-01",
        // 0012 CHECK：CN实体必须baseline。
        operation: "baseline",
      }),
    );
    expect(created.status).toBe(201);
    const idPath =
      "/api/admin/params/APR-TEST-DRAFT-PARAM?jurisdiction_code=CN&version=1";
    try {
      const emptyName = await PATCH(jsonRequest(idPath, "PATCH", { name: "  " }), {
        params: Promise.resolve({ paramId: "APR-TEST-DRAFT-PARAM" }),
      });
      expect(emptyName.status).toBe(400);

      const htmlName = await PATCH(
        jsonRequest(idPath, "PATCH", { name: "<b>名</b>" }),
        { params: Promise.resolve({ paramId: "APR-TEST-DRAFT-PARAM" }) },
      );
      expect(htmlName.status).toBe(400);

      const htmlDesc = await PATCH(
        jsonRequest(idPath, "PATCH", { description: "a < c > b" }),
        { params: Promise.resolve({ paramId: "APR-TEST-DRAFT-PARAM" }) },
      );
      expect(htmlDesc.status).toBe(400);

      const okDesc = await PATCH(
        jsonRequest(idPath, "PATCH", { description: "APR草稿参数说明" }),
        { params: Promise.resolve({ paramId: "APR-TEST-DRAFT-PARAM" }) },
      );
      expect(okDesc.status).toBe(200);
      const body = (await okDesc.json()) as { param: { name: string; description: string | null } };
      expect(body.param.name).toBe("APR草稿测试参数");
      expect(body.param.description).toBe("APR草稿参数说明");
    } finally {
      const c = await client();
      try {
        await c.query(
          "delete from params where jurisdiction_code='CN' and param_id='APR-TEST-DRAFT-PARAM'",
        );
      } finally {
        await c.end();
      }
    }
  });

  it("发布流水线三类实体均返回对应名称（APR-FR-015/AC-010）", async () => {
    const { GET } = await import("@/app/api/admin/publish/pipeline/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as PipelineBody;

    const all = [...body.draft, ...body.staging, ...body.prod];
    expect(all.length).toBeGreaterThan(0);
    for (const entity of all) {
      expect(entity).toHaveProperty("displayName");
    }
    const ruleSet = all.find(
      (e) => e.entityType === "rule_set" && e.entityId === "RS-SHANGHAI-PLAN-V1",
    );
    expect(ruleSet?.displayName).toBe("上海规划主规则集");
    const param = all.find(
      (e) => e.entityType === "param" && e.entityId === "P-SH-MIN-WAGE",
    );
    expect(param?.displayName).toBe("上海市月最低工资标准");
    const rule = all.find(
      (e) => e.entityType === "rule" && e.entityId === "R-510-4050-AMOUNT",
    );
    expect(rule?.displayName).toBeTruthy();
    expect(rule?.displayName).not.toBe("R-510-4050-AMOUNT");
  });

  it("发布历史按精确版本解析名称；身份缺失/实体不存在/删除后不猜测（APR-FR-016/AC-011）", async () => {
    const c = await client();
    try {
      // 夹具2：缺少地区/版本身份的旧行。
      await c.query(
        `insert into publishes (entity_type, entity_id, from_stage, to_stage, actor)
         values ('rule','APR-TEST-LEGACY','draft','staging','apr-test')`,
      );
      // 夹具3：指向不存在实体的行。
      await c.query(
        `insert into publishes (entity_type, entity_id, from_stage, to_stage, actor,
           jurisdiction_code, entity_version)
         values ('rule','APR-TEST-GONE','draft','staging','apr-test','CN',99)`,
      );

      // 多版本精确性：为APR专属参数建v1/v2两行（不同当时名称），v1历史行必须显示v1名称。
      // （不用共享Seed的P-SH-MIN-WAGE造v2：它被快照冲突夹具复用，会产生跨文件版本冲突。）
      await c.query(
        `delete from params where jurisdiction_code='CN' and param_id='APR-TEST-PARAM'`,
      );
      await c.query(
        `insert into params (policy_pack_id, jurisdiction_code, business_key, param_id,
           name, type, value, effective_from, version, status, operation)
         values ('APR-TEST-PACK','CN','APR-TEST-PARAM','APR-TEST-PARAM',
           'APR测试参数v1当时名称','number','1'::jsonb,'2024-01-01',1,'published','baseline'),
          ('APR-TEST-PACK','CN','APR-TEST-PARAM','APR-TEST-PARAM',
           'APR测试参数v2当前名称','number','2'::jsonb,'2025-01-01',2,'draft','baseline')`,
      );
      await c.query(
        `insert into publishes (entity_type, entity_id, from_stage, to_stage, actor,
           jurisdiction_code, entity_version)
         values ('param','APR-TEST-PARAM','draft','staging','apr-test','CN',1)`,
      );

      const { GET } = await import("@/app/api/admin/publish/history/route");
      const res = await GET();
      expect(res.status).toBe(200);
      const rows = (await res.json()) as HistoryRow[];

      const v1History = rows.filter(
        (r) =>
          r.entityType === "param" &&
          r.entityId === "APR-TEST-PARAM" &&
          r.jurisdictionCode === "CN" &&
          r.entityVersion === 1,
      );
      expect(v1History.length).toBeGreaterThan(0);
      // 历史v1行解析到v1当时名称，绝不用v2当前名称冒充。
      expect(v1History.map((r) => r.displayName)).toEqual(
        v1History.map(() => "APR测试参数v1当时名称"),
      );

      const legacy = rows.find((r) => r.entityId === "APR-TEST-LEGACY");
      expect(legacy?.displayName).toBeNull();

      const gone = rows.find((r) => r.entityId === "APR-TEST-GONE");
      expect(gone?.displayName).toBeNull();
    } finally {
      await c.query("delete from publishes where actor='apr-test'");
      await c.query(
        "delete from params where jurisdiction_code='CN' and param_id='APR-TEST-PARAM'",
      );
      await c.end();
    }
  });
});
