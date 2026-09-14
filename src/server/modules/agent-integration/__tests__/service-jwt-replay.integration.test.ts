/**
 * SJWT-FR-008/009 / AC-012/013/014 集成（drill DB）：
 * - JTI事务消费：首次消费、重复拒绝、并发竞争（恰好一个成功）、
 *   业务回滚JTI同回滚（stale拒绝后同claims重试成功）、过期记录机会式清理、
 *   存储不可用统一503类别（绝不回退Header信任，NFR-004）。
 *
 * 路由级鉴权矩阵（Agent→Core draft-imports：缺失/伪造/错误方向/仅X-Service-Name
 * 401、有效200、重放401）位于 src/app/api/internal/v1/draft-imports/__tests__/
 * draft-imports-auth.integration.test.ts（路由层测试不位于模块目录内，
 * 模块边界扫描禁止 next/* 导入）。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已迁移的全新 PostgreSQL 17 库；
 * 未设置时直接失败（不允许以 skip 关闭，PMG-FR-018）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, withTransaction, type DbClient } from "@/lib/db";
import { agentMaterializations, serviceJwtReplays } from "@/lib/db/schema";
import {
  JtiReplayConflictError,
  ServiceAuthStoreUnavailableError,
  consumeServiceJwtJti,
} from "../infrastructure/drizzle/service-jwt-replay.repository";
import { AGENT_IDENTITY, NEXT_IDENTITY, type ServiceJwtClaims } from "@/lib/security/service-jwt";
import { resetServiceJwtInstance } from "@/lib/security/service-jwt-provider";
import { materializeDraftBundle, parseAndReject } from "../application/materialize";

const DRILL = process.env.SOCILA_TEST_DATABASE_URL;

// 合成测试Secret（非生产）：与契约向量无关，仅本文件内签发/验证。
const CURRENT_SECRET = "sjwt-it-current-secret-0123456789-abcdef-0123456789";
const PREVIOUS_SECRET = "sjwt-it-previous-secret-0123456789-abcdef-0123456789";

const JTI_FIRST = "aa000001-0000-4000-8000-000000000001";
const JTI_CONCURRENT = "aa000002-0000-4000-8000-000000000002";
const JTI_ROLLBACK = "aa000003-0000-4000-8000-000000000003";
const JTI_EXPIRED = "aa000004-0000-4000-8000-000000000004";
const JTI_CLEANUP = "aa000005-0000-4000-8000-000000000005";

function claimsFor(jti: string): ServiceJwtClaims {
  const iat = Math.floor(Date.now() / 1000);
  return {
    iss: AGENT_IDENTITY.issuer,
    aud: AGENT_IDENTITY.audience,
    sub: AGENT_IDENTITY.subject,
    jti,
    iat,
    exp: iat + 300,
  };
}

function validBundle(idempotencyKey: string) {
  return {
    proposal_id: "sjwt-prop-it",
    run_id: "sjwt-run-it",
    idempotency_key: idempotencyKey,
    base_snapshot_id: null,
    jurisdiction_code: "310000",
    effective_from: "2026-01-01",
    status: "draft",
    rule_drafts: [
      {
        temp_id: "t1",
        rule_id: `R-SJWT-IT-${idempotencyKey}`,
        name: "SJWT集成测试规则",
        decision_table: { hit_policy: "first", rows: [] },
        effective_from: "2026-01-01",
        citations: [{ document_version_id: "dv-sjwt-it", path: "/doc/article" }],
        parameter_refs: [],
      },
    ],
    param_drafts: [],
    test_drafts: [],
    citations: [],
  };
}

describe("SJWT JTI事务消费（drill DB）", () => {
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
    await db.execute(
      sql`DELETE FROM service_jwt_replays WHERE jti IN (
        ${JTI_FIRST}, ${JTI_CONCURRENT}, ${JTI_ROLLBACK}, ${JTI_EXPIRED}, ${JTI_CLEANUP}
      )`,
    );
    await db.execute(sql`DELETE FROM agent_materializations WHERE idempotency_key LIKE 'sjwt-it-%'`);
    await db.execute(sql`DELETE FROM rules WHERE rule_id LIKE 'R-SJWT-IT-%'`);
    resetServiceJwtInstance();
  });

  it("AC-012前置：首次消费成功，行内容=claims元数据（不含令牌/签名）", async () => {
    const claims = claimsFor(JTI_FIRST);
    const consumed = await withTransaction((tx) => consumeServiceJwtJti(tx, claims));
    expect(consumed).toBe(true);

    const rows = await db
      .select({
        issuer: serviceJwtReplays.issuer,
        subject: serviceJwtReplays.subject,
        audience: serviceJwtReplays.audience,
        expiresAt: serviceJwtReplays.expiresAt,
      })
      .from(serviceJwtReplays)
      .where(eq(serviceJwtReplays.jti, JTI_FIRST));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.issuer).toBe(AGENT_IDENTITY.issuer);
    expect(row.subject).toBe(AGENT_IDENTITY.subject);
    expect(row.audience).toBe(AGENT_IDENTITY.audience);
    // expires_at = claims.exp（timestamptz），允许几秒内时钟误差。
    expect(Math.abs(row.expiresAt.getTime() / 1000 - claims.exp)).toBeLessThanOrEqual(5);
  });

  it("AC-012：同一JTI在独立事务中重复消费 → false（重放）", async () => {
    const consumed = await withTransaction((tx) => consumeServiceJwtJti(tx, claimsFor(JTI_FIRST)));
    expect(consumed).toBe(false);
  });

  it("AC-012：并发同JTI竞争，恰好一个成功，其余全部重放拒绝", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        withTransaction((tx) => consumeServiceJwtJti(tx, claimsFor(JTI_CONCURRENT))),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("AC-013：业务失败（stale拒绝）回滚JTI，同claims+合法bundle重试成功", async () => {
    const claims = claimsFor(JTI_ROLLBACK);
    const stale = {
      ...validBundle("sjwt-it-rollback"),
      base_snapshot_id: "00000000-0000-4000-8000-000000000009",
    };
    await expect(
      materializeDraftBundle(parseAndReject(stale), "agent-runtime", claims),
    ).rejects.toThrow(/stale|重新运行影响分析/);

    // JTI随事务回滚：同claims可再次消费。
    const ok = await materializeDraftBundle(
      parseAndReject(validBundle("sjwt-it-rollback")),
      "agent-runtime",
      claims,
    );
    expect(ok.idempotent).toBe(false);
    expect(ok.draft_ids.rules).toHaveLength(1);

    // 台账入库且仅一条。
    const ledger = await db
      .select()
      .from(agentMaterializations)
      .where(eq(agentMaterializations.idempotencyKey, "sjwt-it-rollback"));
    expect(ledger).toHaveLength(1);
  });

  it("§7.3：过期重放记录机会式清理（新消费时删除expires_at<now的行）", async () => {
    await db.execute(
      sql`INSERT INTO service_jwt_replays (jti, issuer, subject, audience, expires_at)
          VALUES (${JTI_EXPIRED}, 'old', 'old', 'old', now() - interval '1 hour')`,
    );
    await withTransaction((tx) => consumeServiceJwtJti(tx, claimsFor(JTI_CLEANUP)));
    const rows = await db
      .select()
      .from(serviceJwtReplays)
      .where(eq(serviceJwtReplays.jti, JTI_EXPIRED));
    expect(rows).toHaveLength(0);
  });

  it("AC-014：存储不可用 → ServiceAuthStoreUnavailableError（失败关闭，不回退Header信任）", async () => {
    const brokenTx = {
      delete: () => {
        throw new Error("connection lost");
      },
    } as unknown as DbClient;
    await expect(consumeServiceJwtJti(brokenTx, claimsFor(JTI_CLEANUP))).rejects.toThrow(
      ServiceAuthStoreUnavailableError,
    );
    await expect(
      consumeServiceJwtJti(brokenTx, claimsFor(JTI_CLEANUP)),
    ).rejects.toThrow(/SERVICE_AUTH_STORE_UNAVAILABLE/);
  });

  it("JtiReplayConflictError携带JTI（日志/指标元数据，不含令牌）", async () => {
    expect(new JtiReplayConflictError(JTI_FIRST).jti).toBe(JTI_FIRST);
  });

  it("AC-015对称：Next→Agent方向的固定身份常量与向量同源", async () => {
    expect(NEXT_IDENTITY).toEqual({
      issuer: "socila-next-core",
      audience: "policy-agent",
      subject: "next-core",
    });
    expect(AGENT_IDENTITY).toEqual({
      issuer: "policy-agent",
      audience: "socila-next-core",
      subject: "agent-runtime",
    });
  });
});
