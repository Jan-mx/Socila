/**
 * APR-FR-003～009（集成面）：规则集精确身份、成员批量解析、名称补全与选择器。
 * 直接以NextRequest调用route handler（与nrp-identity-regional同模式）。
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

interface MemberView {
  position: number;
  ruleId: string;
  name: string | null;
  jurisdictionCode: string | null;
  version: number | null;
  status: string | null;
  operation: string | null;
  missing: boolean;
}

const TEST_SET = "RS-APR-TEST-V1";

describe("规则集成员中文可读化（APR-FR-003～009，路由级）", () => {
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
        "delete from rule_sets where jurisdiction_code='310000' and rule_set_id=$1",
        [TEST_SET],
      );
    } finally {
      await c.end();
    }
  });

  it("列表携带正式中文名称（APR-FR-003）", async () => {
    const { GET } = await import("@/app/api/admin/rule-sets/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rule_sets: Array<{ ruleSetId: string; name: string; jurisdictionCode: string | null }>;
    };
    const sh = body.rule_sets.find(
      (r) => r.ruleSetId === "RS-SHANGHAI-PLAN-V1" && r.jurisdictionCode === "310000",
    );
    expect(sh?.name).toBe("上海规划主规则集");
    const cn = body.rule_sets.find(
      (r) => r.ruleSetId === "RS-CN-PLAN-V1" && r.jurisdictionCode === "CN",
    );
    expect(cn?.name).toBe("国家规划主规则集");
  });

  it("详情同时返回原始rules与解析members，顺序与持久化数组一致（APR-FR-004/005/006、AC-003/004）", async () => {
    const { GET } = await import("@/app/api/admin/rule-sets/[id]/route");
    const res = await GET(
      jsonRequest(
        "/api/admin/rule-sets/RS-SHANGHAI-PLAN-V1?jurisdiction_code=310000&version=1",
        "GET",
      ),
      { params: Promise.resolve({ id: "RS-SHANGHAI-PLAN-V1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rule_set: { name: string; rules: string[] };
      rules: string[];
      members: MemberView[];
      asOfDate: string;
    };
    expect(body.rule_set.name).toBe("上海规划主规则集");
    expect(body.rules.length).toBeGreaterThan(20);
    expect(body.members.map((m) => m.ruleId)).toEqual(body.rules);
    expect(body.members.map((m) => m.position)).toEqual(
      body.rules.map((_, i) => i),
    );
    expect(body.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // CN基线成员显示中文名称并标记来源地区CN。
    const baseline = body.members.find((m) => m.ruleId === "R-010-PARSE-BIRTH-YEAR");
    expect(baseline?.missing).toBe(false);
    expect(baseline?.jurisdictionCode).toBe("CN");
    expect(baseline?.name).toBeTruthy();
    expect(baseline?.version).toBeGreaterThanOrEqual(1);

    // 上海地方add成员来源地区310000。
    const local = body.members.find((m) => m.ruleId === "R-500-4050-ELIGIBILITY");
    expect(local?.missing).toBe(false);
    expect(local?.jurisdictionCode).toBe("310000");
    expect(local?.operation).toBe("add");
  });

  it("缺identity返回400、错误地区/版本返回404、不跨地区猜测（APR-FR-006）", async () => {
    const { GET } = await import("@/app/api/admin/rule-sets/[id]/route");
    const missing = await GET(
      jsonRequest("/api/admin/rule-sets/RS-SHANGHAI-PLAN-V1", "GET"),
      { params: Promise.resolve({ id: "RS-SHANGHAI-PLAN-V1" }) },
    );
    expect(missing.status).toBe(400);

    const wrongJur = await GET(
      jsonRequest(
        "/api/admin/rule-sets/RS-CN-PLAN-V1?jurisdiction_code=310000&version=1",
        "GET",
      ),
      { params: Promise.resolve({ id: "RS-CN-PLAN-V1" }) },
    );
    expect(wrongJur.status).toBe(404);

    const wrongVersion = await GET(
      jsonRequest(
        "/api/admin/rule-sets/RS-SHANGHAI-PLAN-V1?jurisdiction_code=310000&version=42",
        "GET",
      ),
      { params: Promise.resolve({ id: "RS-SHANGHAI-PLAN-V1" }) },
    );
    expect(wrongVersion.status).toBe(404);
  });

  it("as_of_date允许合法值并回显；非法格式400（APR-FR-007）", async () => {
    const { GET } = await import("@/app/api/admin/rule-sets/[id]/route");
    const ok = await GET(
      jsonRequest(
        "/api/admin/rule-sets/RS-SHANGHAI-PLAN-V1?jurisdiction_code=310000&version=1&as_of_date=2026-01-01",
        "GET",
      ),
      { params: Promise.resolve({ id: "RS-SHANGHAI-PLAN-V1" }) },
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { asOfDate: string };
    expect(body.asOfDate).toBe("2026-01-01");

    const bad = await GET(
      jsonRequest(
        "/api/admin/rule-sets/RS-SHANGHAI-PLAN-V1?jurisdiction_code=310000&version=1&as_of_date=2026/01/01",
        "GET",
      ),
      { params: Promise.resolve({ id: "RS-SHANGHAI-PLAN-V1" }) },
    );
    expect(bad.status).toBe(400);
  });

  it("缺失成员保留原位置missing=true；保存含重复或缺失成员被拒绝并指出编号（APR-FR-007、AC-006）", async () => {
    const c = await client();
    try {
      await c.query("begin");
      await c.query(
        `insert into rule_sets (rule_set_id, jurisdiction_code, name, description, status,
           effective_from, rules, version, operation)
         values ($1,'310000','测试规则集','APR集成测试','draft','2024-01-01',
           '["R-010-PARSE-BIRTH-YEAR","R-GHOST-9999","R-500-4050-ELIGIBILITY"]',1,'add')`,
        [TEST_SET],
      );
      await c.query("commit");
    } finally {
      await c.end();
    }

    const { GET, PATCH } = await import("@/app/api/admin/rule-sets/[id]/route");
    const detail = await GET(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}?jurisdiction_code=310000&version=1`,
        "GET",
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { members: MemberView[] };
    expect(body.members[1]).toMatchObject({
      position: 1,
      ruleId: "R-GHOST-9999",
      missing: true,
      name: null,
      jurisdictionCode: null,
    });
    // 其余成员保持原位置。
    expect(body.members[0].ruleId).toBe("R-010-PARSE-BIRTH-YEAR");
    expect(body.members[2].ruleId).toBe("R-500-4050-ELIGIBILITY");

    // 保存含缺失成员 → 400并指出问题编号。
    const badSave = await PATCH(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}?jurisdiction_code=310000&version=1`,
        "PATCH",
        { rules: ["R-010-PARSE-BIRTH-YEAR", "R-GHOST-9999"] },
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    expect(badSave.status).toBe(400);
    const badBody = (await badSave.json()) as { error: string; invalidRuleIds?: string[] };
    expect(badBody.error).toContain("无法解析");
    expect(badBody.invalidRuleIds).toEqual(["R-GHOST-9999"]);

    // 保存含重复成员 → 400并指出重复编号。
    const dupSave = await PATCH(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}?jurisdiction_code=310000&version=1`,
        "PATCH",
        { rules: ["R-010-PARSE-BIRTH-YEAR", "R-010-PARSE-BIRTH-YEAR"] },
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    expect(dupSave.status).toBe(400);
    const dupBody = (await dupSave.json()) as { duplicateRuleIds?: string[] };
    expect(dupBody.duplicateRuleIds).toEqual(["R-010-PARSE-BIRTH-YEAR"]);

    // 合法保存成功且顺序原样持久化。
    const goodSave = await PATCH(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}?jurisdiction_code=310000&version=1`,
        "PATCH",
        { rules: ["R-500-4050-ELIGIBILITY", "R-010-PARSE-BIRTH-YEAR"] },
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    expect(goodSave.status).toBe(200);
    const c2 = await client();
    try {
      const row = await c2.query(
        "select rules from rule_sets where jurisdiction_code='310000' and rule_set_id=$1 and version=1",
        [TEST_SET],
      );
      expect(row.rows[0].rules).toEqual(["R-500-4050-ELIGIBILITY", "R-010-PARSE-BIRTH-YEAR"]);
    } finally {
      await c2.end();
    }
  });

  it("PATCH name更新正式名称；受控字段与空名称被拒绝（APR-FR-003/§9）", async () => {
    const { PATCH } = await import("@/app/api/admin/rule-sets/[id]/route");
    const emptyName = await PATCH(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}?jurisdiction_code=310000&version=1`,
        "PATCH",
        { name: "   " },
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    expect(emptyName.status).toBe(400);

    const controlled = await PATCH(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}?jurisdiction_code=310000&version=1`,
        "PATCH",
        { name: "新名称", status: "published" },
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    expect(controlled.status).toBe(400);

    const ok = await PATCH(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}?jurisdiction_code=310000&version=1`,
        "PATCH",
        { name: "测试规则集改名" },
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { rule_set: { name: string } };
    expect(body.rule_set.name).toBe("测试规则集改名");

    // §9：name/description提交时拒绝HTML尖括号（白名单放行≠跳过校验）。
    const htmlName = await PATCH(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}?jurisdiction_code=310000&version=1`,
        "PATCH",
        { name: "<script>名称</script>" },
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    expect(htmlName.status).toBe(400);

    const htmlDesc = await PATCH(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}?jurisdiction_code=310000&version=1`,
        "PATCH",
        { description: "说明含<img src=x>标签" },
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    expect(htmlDesc.status).toBe(400);

    // 被拒绝的PATCH不得产生任何写入。
    const c3 = await client();
    try {
      const row = await c3.query(
        "select name, description from rule_sets where jurisdiction_code='310000' and rule_set_id=$1 and version=1",
        [TEST_SET],
      );
      expect(row.rows[0].name).toBe("测试规则集改名");
      expect(row.rows[0].description).toBe("APR集成测试");
    } finally {
      await c3.end();
    }
  });

  it("选择器按名称与编号搜索、排除已加入成员、保存值仍为编号（APR-FR-009/AC-007）", async () => {
    const { GET } = await import("@/app/api/admin/rule-sets/[id]/candidates/route");
    const nameHit = await GET(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}/candidates?jurisdiction_code=310000&version=1&q=4050补贴资格`,
        "GET",
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    expect(nameHit.status).toBe(200);
    const nameBody = (await nameHit.json()) as {
      candidates: Array<{ ruleId: string; name: string; jurisdictionCode: string }>;
    };
    expect(nameBody.candidates.every((x) => x.ruleId !== "R-500-4050-ELIGIBILITY")).toBe(true);

    const idHit = await GET(
      jsonRequest(
        `/api/admin/rule-sets/${TEST_SET}/candidates?jurisdiction_code=310000&version=1&q=R-200`,
        "GET",
      ),
      { params: Promise.resolve({ id: TEST_SET }) },
    );
    const idBody = (await idHit.json()) as {
      candidates: Array<{ ruleId: string; name: string | null }>;
    };
    expect(idBody.candidates.some((x) => x.ruleId === "R-200-MIN-PENSION-YEARS")).toBe(true);
    // 中文名称可搜索命中（名称非空）。
    expect(idBody.candidates.find((x) => x.ruleId === "R-200-MIN-PENSION-YEARS")?.name).toBeTruthy();
  });

  it("POST创建规则集缺少名称返回400；成员含ghost编号拒绝创建（APR-FR-017、F7回归）", async () => {
    const { POST } = await import("@/app/api/admin/rule-sets/route");
    const res = await POST(
      jsonRequest("/api/admin/rule-sets", "POST", {
        ruleSetId: "RS-APR-NO-NAME",
        jurisdictionCode: "310000",
        rules: [],
        effectiveFrom: "2024-01-01",
      }),
    );
    expect(res.status).toBe(400);

    const ghost = await POST(
      jsonRequest("/api/admin/rule-sets", "POST", {
        ruleSetId: "RS-APR-GHOST",
        jurisdictionCode: "310000",
        name: "APR幽灵成员规则集",
        rules: ["R-NOPE-GHOST"],
        effectiveFrom: "2024-01-01",
      }),
    );
    expect(ghost.status).toBe(400);
    const ghostBody = (await ghost.json()) as { invalidRuleIds?: string[] };
    expect(ghostBody.invalidRuleIds).toEqual(["R-NOPE-GHOST"]);
    // 零写入。
    const c = await client();
    try {
      const rows = await c.query(
        "select 1 from rule_sets where rule_set_id in ('RS-APR-NO-NAME','RS-APR-GHOST')",
      );
      expect(rows.rowCount).toBe(0);
    } finally {
      await c.end();
    }
  });

  it("规则name PATCH/POST：空名与HTML尖括号拒绝且零写入（APR-FR-004/§9，二轮复审F1）", async () => {
    const { PATCH } = await import("@/app/api/admin/rules/[ruleId]/route");
    const { POST } = await import("@/app/api/admin/rules/route");
    const draftRule = "R-APR-DRAFT-NAME";

    // 防御性预清理：rules无(jurisdiction,rule_id,version)唯一索引，
    // 中断运行残留会让本用例双行歧义。
    {
      const pre = await client();
      try {
        await pre.query(
          "delete from rules where jurisdiction_code='CN' and rule_id in ($1,$2)",
          [draftRule, "R-APR-E2E-NAME"],
        );
      } finally {
        await pre.end();
      }
    }

    // 先建合法草稿（name校验通过），PATCH腿才能触达name校验而非草稿门槛。
    const created = await POST(
      jsonRequest("/api/admin/rules", "POST", {
        ruleId: draftRule,
        jurisdictionCode: "CN",
        name: "APR名称校验草稿规则",
        module: "test",
        dslVersion: "SOCILA-DSL-1.0",
        priority: 999,
        effectiveFrom: "2024-01-01",
        operation: "baseline",
        decisionTable: { hit_policy: "first", rows: [] },
      }),
    );
    expect(created.status).toBe(201);

    const htmlName = await PATCH(
      jsonRequest(
        `/api/admin/rules/${draftRule}?jurisdiction_code=CN&version=1`,
        "PATCH",
        { name: "<script>x</script>" },
      ),
      { params: Promise.resolve({ ruleId: draftRule }) },
    );
    expect(htmlName.status).toBe(400);
    const htmlBody = (await htmlName.json()) as { error?: string };
    // 400必须来自name校验而非草稿门槛文案（判别力）。
    expect(htmlBody.error ?? "").toContain("HTML尖括号");

    const emptyName = await PATCH(
      jsonRequest(
        `/api/admin/rules/${draftRule}?jurisdiction_code=CN&version=1`,
        "PATCH",
        { name: "   " },
      ),
      { params: Promise.resolve({ ruleId: draftRule }) },
    );
    expect(emptyName.status).toBe(400);
    const emptyBody = (await emptyName.json()) as { error?: string };
    expect(emptyBody.error ?? "").toContain("正式中文名称");

    // 合法PATCH仍然放行。
    const okName = await PATCH(
      jsonRequest(
        `/api/admin/rules/${draftRule}?jurisdiction_code=CN&version=1`,
        "PATCH",
        { name: "APR名称校验草稿规则改名" },
      ),
      { params: Promise.resolve({ ruleId: draftRule }) },
    );
    expect(okName.status).toBe(200);

    const htmlCreate = await POST(
      jsonRequest("/api/admin/rules", "POST", {
        ruleId: "R-APR-E2E-NAME",
        jurisdictionCode: "CN",
        name: "<b>新规则</b>",
        module: "test",
        dslVersion: "SOCILA-DSL-1.0",
        priority: 999,
        effectiveFrom: "2024-01-01",
        decisionTable: { hit_policy: "first", rows: [] },
      }),
    );
    expect(htmlCreate.status).toBe(400);
    const missingName = await POST(
      jsonRequest("/api/admin/rules", "POST", {
        ruleId: "R-APR-E2E-NAME",
        jurisdictionCode: "CN",
        module: "test",
        dslVersion: "SOCILA-DSL-1.0",
        priority: 999,
        effectiveFrom: "2024-01-01",
        decisionTable: { hit_policy: "first", rows: [] },
      }),
    );
    expect(missingName.status).toBe(400);

    const c = await client();
    try {
      const rows = await c.query(
        `select name from rules where jurisdiction_code='CN' and rule_id=$1 and version=1`,
        [draftRule],
      );
      // 非法PATCH零写入：保持最近一次合法值。
      expect(rows.rows[0].name).toBe("APR名称校验草稿规则改名");
      const created2 = await c.query(
        "select 1 from rules where rule_id='R-APR-E2E-NAME'",
      );
      expect(created2.rowCount).toBe(0);
    } finally {
      await c.query(
        "delete from rules where jurisdiction_code='CN' and rule_id=$1",
        [draftRule],
      );
      await c.end();
    }
  });

  it("POST空rules草稿放行、PATCH空rules拒绝（成员校验语义钉住，三轮复审M4）", async () => {
    const { POST } = await import("@/app/api/admin/rule-sets/route");
    const { PATCH } = await import("@/app/api/admin/rule-sets/[id]/route");
    {
      const pre = await client();
      try {
        await pre.query(
          "delete from rule_sets where jurisdiction_code='310000' and rule_set_id='RS-APR-EMPTY-V1'",
        );
      } finally {
        await pre.end();
      }
    }
    const empty = await POST(
      jsonRequest("/api/admin/rule-sets", "POST", {
        ruleSetId: "RS-APR-EMPTY-V1",
        jurisdictionCode: "310000",
        name: "APR空成员规则集",
        rules: [],
        effectiveFrom: "2024-01-01",
      }),
    );
    expect(empty.status).toBe(201);
    try {
      const emptyPatch = await PATCH(
        jsonRequest(
          `/api/admin/rule-sets/RS-APR-EMPTY-V1?jurisdiction_code=310000&version=1`,
          "PATCH",
          { rules: [] },
        ),
        { params: Promise.resolve({ id: "RS-APR-EMPTY-V1" }) },
      );
      expect(emptyPatch.status).toBe(400);
    } finally {
      const c = await client();
      try {
        await c.query(
          "delete from rule_sets where jurisdiction_code='310000' and rule_set_id='RS-APR-EMPTY-V1'",
        );
      } finally {
        await c.end();
      }
    }
  });
});
