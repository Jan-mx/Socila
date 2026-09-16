/**
 * 修复轮I2（集成面）：规则集详情/保存校验必须把目标继承链上的非成员
 * overlay载体（restrict/exempt/replace，载体编号不在成员数组内）一次批量
 * 装载进merge语义——广东RS-GD-PLAN-V1的R-220-MEDICAL-LIFETIME-GAP被
 * R-GD-MI-RETIRE-RESTRICT（restrict）叠加，成员视图必须显示restrict已生效
 * 并携带载体精确身份（可展开）；载体绝不进入执行顺序。
 * 载体/基线的下线用status翻转模拟候选消失，finally恢复种子published原状。
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

interface OverlayView {
  operation: string;
  ruleId: string;
  name: string | null;
  jurisdictionCode: string;
  version: number;
  effectiveFrom: string;
}

interface MemberView {
  position: number;
  ruleId: string;
  name: string | null;
  jurisdictionCode: string | null;
  version: number | null;
  status: string | null;
  operation: string | null;
  overlays: OverlayView[];
  missing: boolean;
}

interface DetailBody {
  rules: string[];
  members: MemberView[];
}

const CARRIER = "R-GD-MI-RETIRE-RESTRICT";
const TARGET = "R-220-MEDICAL-LIFETIME-GAP";
const SAVE_SET = "RS-APR-FIX-GD-SAVE";

async function setRuleStatus(
  c: Client,
  ruleId: string,
  jurisdictionCode: string,
  status: string,
) {
  await c.query(
    "update rules set status=$3 where jurisdiction_code=$1 and rule_id=$2 and version=1",
    [jurisdictionCode, ruleId, status],
  );
}

async function getGdDetail(): Promise<{ status: number; body: DetailBody }> {
  const { GET } = await import("@/app/api/admin/rule-sets/[id]/route");
  const res = await GET(
    jsonRequest(
      "/api/admin/rule-sets/RS-GD-PLAN-V1?jurisdiction_code=440000&version=1",
      "GET",
    ),
    { params: Promise.resolve({ id: "RS-GD-PLAN-V1" }) },
  );
  return { status: res.status, body: (await res.json()) as DetailBody };
}

describe("非成员overlay载体参与成员解析与保存校验（修复轮I2，路由级）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  afterAll(async () => {
    const c = await client();
    try {
      await setRuleStatus(c, CARRIER, "440000", "published");
      await setRuleStatus(c, TARGET, "CN", "published");
      await c.query(
        "delete from rule_sets where jurisdiction_code='440000' and rule_set_id=$1",
        [SAVE_SET],
      );
    } finally {
      await c.end();
    }
  });

  it("广东R-220显示restrict已生效并携带载体精确身份；载体不进入执行顺序", async () => {
    const { status, body } = await getGdDetail();
    expect(status).toBe(200);
    // 执行顺序=持久化数组，载体不得作为独立可执行成员出现。
    expect(body.rules).not.toContain(CARRIER);
    expect(body.members.map((m) => m.ruleId)).toEqual(body.rules);
    const member = body.members.find((m) => m.ruleId === TARGET);
    expect(member).toBeDefined();
    expect(member?.missing).toBe(false);
    // 内容来源仍是国家baseline。
    expect(member?.jurisdictionCode).toBe("CN");
    // 最后生效overlay可见：restrict（而非误显示的纯baseline）。
    expect(member?.operation).toBe("restrict");
    expect(member?.overlays).toEqual([
      {
        operation: "restrict",
        ruleId: CARRIER,
        name: expect.any(String),
        jurisdictionCode: "440000",
        version: 1,
        effectiveFrom: expect.any(String),
      },
    ]);
    expect(member?.overlays[0].name).not.toHaveLength(0);
  });

  it("保存校验基于完整链合并：POST/PATCH相同有序成员后restrict语义不丢失", async () => {
    const { POST } = await import("@/app/api/admin/rule-sets/route");
    const created = await POST(
      jsonRequest("/api/admin/rule-sets", "POST", {
        ruleSetId: SAVE_SET,
        jurisdictionCode: "440000",
        name: "APR修复轮广东覆盖保存校验规则集",
        rules: [TARGET],
      }),
    );
    expect(created.status).toBe(201);

    const { PATCH } = await import("@/app/api/admin/rule-sets/[id]/route");
    const saved = await PATCH(
      jsonRequest(
        `/api/admin/rule-sets/${SAVE_SET}?jurisdiction_code=440000&version=1`,
        "PATCH",
        { rules: [TARGET] },
      ),
      { params: Promise.resolve({ id: SAVE_SET }) },
    );
    expect(saved.status).toBe(200);

    // 保存后成员视图仍显示restrict（成员数组仍只含政策键本身）。
    const { GET } = await import("@/app/api/admin/rule-sets/[id]/route");
    const res = await GET(
      jsonRequest(
        `/api/admin/rule-sets/${SAVE_SET}?jurisdiction_code=440000&version=1`,
        "GET",
      ),
      { params: Promise.resolve({ id: SAVE_SET }) },
    );
    const body = (await res.json()) as DetailBody;
    expect(body.rules).toEqual([TARGET]);
    expect(body.members[0]?.operation).toBe("restrict");
    expect(body.members[0]?.overlays.map((o) => o.ruleId)).toEqual([CARRIER]);
  });

  it("载体候选撤销后R-220退回纯国家baseline（overlays空）", async () => {
    const c = await client();
    try {
      await setRuleStatus(c, CARRIER, "440000", "draft");
      const { status, body } = await getGdDetail();
      expect(status).toBe(200);
      const member = body.members.find((m) => m.ruleId === TARGET);
      expect(member?.operation).toBe("baseline");
      expect(member?.overlays).toEqual([]);
      expect(member?.jurisdictionCode).toBe("CN");
    } finally {
      await setRuleStatus(c, CARRIER, "440000", "published");
      await c.end();
    }
  });

  it("restrict目标baseline缺失时fail-closed：成员标记missing不猜测", async () => {
    const c = await client();
    try {
      await setRuleStatus(c, TARGET, "CN", "draft");
      const { status, body } = await getGdDetail();
      expect(status).toBe(200);
      const member = body.members.find((m) => m.ruleId === TARGET);
      expect(member?.position).toBe(body.rules.indexOf(TARGET));
      expect(member?.missing).toBe(true);
      expect(member?.operation).toBeNull();
      expect(member?.overlays).toEqual([]);
    } finally {
      await setRuleStatus(c, TARGET, "CN", "published");
      await c.end();
    }
  });
});
