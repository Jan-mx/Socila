/**
 * SJWT-FR-005/006/009 / AC-002/003/012/015 路由级集成（Agent→Core方向，drill DB）：
 * - 缺失Authorization / 仅X-Service-Name / 伪造Secret / 错误方向 → 统一401
 *   SERVICE_AUTH_INVALID + Cache-Control: no-store（X-Service-Name不参与判断，FR-006）；
 * - 有效Agent令牌 → 200且agent_materializations台账入库；
 * - 同JTI重放 → 401且无业务副作用（JTI消费先于业务检查，FR-008）；
 * - 重放拒绝的JTI保持已消费状态：再次重放仍401。
 *
 * 位置说明：本文件位于模块测试目录（而非路由目录）——
 * 路由依赖门禁（route-dependencies.test.ts，CORE-AC-001）禁止 src/app 下
 * 直接导入 @/lib/db*，而台账断言需要数据库访问；模块边界门禁禁止
 * src/server/modules 下导入 next/*，故此处直接调用路由函数并以标准
 * Web Request 构造请求（路由实现只使用 req.headers/req.json 标准接口）。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已迁移的全新 PostgreSQL 17 库；
 * 未设置时直接失败（不允许以 skip 关闭，PMG-FR-018）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentMaterializations } from "@/lib/db/schema";
import { ServiceJwt } from "@/lib/security/service-jwt";
import { resetServiceJwtInstance } from "@/lib/security/service-jwt-provider";
import { POST } from "@/app/api/internal/v1/draft-imports/route";

const DRILL = process.env.SOCILA_TEST_DATABASE_URL;

// 合成测试Secret（非生产）：仅本文件内签发/验证，与契约向量无关。
const CURRENT_SECRET = "sjwt-rt-current-secret-0123456789-abcdef-0123456789";
const PREVIOUS_SECRET = "sjwt-rt-previous-secret-0123456789-abcdef-0123456789";
const FORGED_SECRET = "sjwt-rt-forged-secret-0123456789-abcdef-0123456789";

const CONSUMED_JTIS: string[] = [];

function postRequest(headers: Record<string, string>, body: unknown): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/internal/v1/draft-imports", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

function validBundle(idempotencyKey: string) {
  return {
    proposal_id: "sjwt-prop-rt",
    run_id: "sjwt-run-rt",
    idempotency_key: idempotencyKey,
    base_snapshot_id: null,
    jurisdiction_code: "310000",
    effective_from: "2026-01-01",
    status: "draft",
    rule_drafts: [
      {
        temp_id: "t1",
        rule_id: `R-SJWT-RT-${idempotencyKey}`,
        name: "SJWT路由集成测试规则",
        decision_table: { hit_policy: "first", rows: [] },
        effective_from: "2026-01-01",
        citations: [{ document_version_id: "dv-sjwt-rt", path: "/doc/article" }],
        parameter_refs: [],
      },
    ],
    param_drafts: [],
    test_drafts: [],
    citations: [],
  };
}

function tokenJti(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  return payload.jti as string;
}

describe("SJWT-FR-005/006：draft-imports路由鉴权（Agent→Core方向，drill DB）", () => {
  beforeAll(() => {
    if (!DRILL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL;
    process.env.AGENT_SERVICE_JWT_CURRENT = CURRENT_SECRET;
    process.env.AGENT_SERVICE_JWT_PREVIOUS = PREVIOUS_SECRET;
    resetServiceJwtInstance();
  });

  afterAll(async () => {
    for (const jti of CONSUMED_JTIS) {
      await db.execute(sql`DELETE FROM service_jwt_replays WHERE jti = ${jti}`);
    }
    await db.execute(sql`DELETE FROM agent_materializations WHERE idempotency_key LIKE 'sjwt-rt-%'`);
    await db.execute(sql`DELETE FROM rules WHERE rule_id LIKE 'R-SJWT-RT-%'`);
    resetServiceJwtInstance();
  });

  it("缺失Authorization → 401 SERVICE_AUTH_INVALID + no-store", async () => {
    const res = await POST(postRequest({}, validBundle("sjwt-rt-noauth")));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "SERVICE_AUTH_INVALID" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("仅X-Service-Name（无JWT）→ 401：Header不再承担鉴权（SJWT-FR-006）", async () => {
    const res = await POST(
      postRequest({ "x-service-name": "agent-runtime" }, validBundle("sjwt-rt-header-only")),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "SERVICE_AUTH_INVALID" });
  });

  it("伪造签名（错误Secret）→ 401；错误方向（Next身份令牌）→ 401", async () => {
    const signer = new ServiceJwt({ current: FORGED_SECRET });
    const forged = await signer.signAgentToken();
    const forgedRes = await POST(
      postRequest({ authorization: `Bearer ${forged}` }, validBundle("sjwt-rt-forged")),
    );
    expect(forgedRes.status).toBe(401);
    expect(await forgedRes.json()).toEqual({ error: "SERVICE_AUTH_INVALID" });

    // 环境Secret与FORGED不同：Next方向令牌即使签名合法也不满足Agent身份。
    const nextSigner = new ServiceJwt({ current: CURRENT_SECRET });
    const nextToken = await nextSigner.signNextToken();
    const dirRes = await POST(
      postRequest({ authorization: `Bearer ${nextToken}` }, validBundle("sjwt-rt-wrong-dir")),
    );
    expect(dirRes.status).toBe(401);
    expect(await dirRes.json()).toEqual({ error: "SERVICE_AUTH_INVALID" });
  });

  it("SJWT-FR-005/AC-012：有效Agent令牌物化成功（台账入库）；同JTI重放401且无副作用", async () => {
    const signer = new ServiceJwt({ current: CURRENT_SECRET, previous: PREVIOUS_SECRET });
    const token = await signer.signAgentToken();
    const jti = tokenJti(token);
    expect(jti).toMatch(/^[0-9a-f-]{36}$/i);
    CONSUMED_JTIS.push(jti);

    const first = await POST(
      postRequest(
        {
          authorization: `Bearer ${token}`,
          "x-service-name": "agent-runtime",
          "content-type": "application/json",
        },
        validBundle("sjwt-rt-valid"),
      ),
    );
    expect(first.status).toBe(200);
    const body = (await first.json()) as { idempotent: boolean; draft_ids: { rules: number[] } };
    expect(body.idempotent).toBe(false);
    expect(body.draft_ids.rules).toHaveLength(1);

    const ledger = await db
      .select()
      .from(agentMaterializations)
      .where(eq(agentMaterializations.idempotencyKey, "sjwt-rt-valid"));
    expect(ledger).toHaveLength(1);

    // 重放：同令牌（同JTI）+ 不同业务幂等键 → JTI先于业务检查冲突 → 401且无台账。
    const replay = await POST(
      postRequest(
        { authorization: `Bearer ${token}`, "content-type": "application/json" },
        validBundle("sjwt-rt-replay"),
      ),
    );
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ error: "SERVICE_AUTH_INVALID" });
    expect(replay.headers.get("cache-control")).toBe("no-store");

    const replayLedger = await db
      .select()
      .from(agentMaterializations)
      .where(eq(agentMaterializations.idempotencyKey, "sjwt-rt-replay"));
    expect(replayLedger).toHaveLength(0);

    // 重放拒绝的JTI保持已消费状态（不是回滚）：再次重放仍是401。
    const replayAgain = await POST(
      postRequest(
        { authorization: `Bearer ${token}`, "content-type": "application/json" },
        validBundle("sjwt-rt-replay-2"),
      ),
    );
    expect(replayAgain.status).toBe(401);
  });
});
