/**
 * 步骤02.3 写仓储集成测试（CORE-FR-004/005）：CRUD、事务回滚、并发。
 * 前提：SOCILA_TEST_DATABASE_URL 指向已迁移的全新 PostgreSQL 17 库；
 * 未设置时直接失败（不允许以 skip 关闭，PMG-FR-018）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, withTransaction } from "@/lib/db";
import { conversations, plans, rules } from "@/lib/db/schema";
import { DrizzleRulesWriteRepository } from "@/server/modules/rules/infrastructure/drizzle/rules-write.repository";
import { DrizzleRulesReadRepository } from "@/server/modules/rules/infrastructure/drizzle/rules-read.repository";
import { DrizzlePlanningWriteRepository } from "@/server/modules/planning/infrastructure/drizzle/planning-write.repository";
import { DrizzleConversationWriteRepository } from "@/server/modules/conversation/infrastructure/drizzle/conversation-write.repository";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

describe("write repositories (CRUD/rollback/concurrency)", () => {
  const rulesWrites = new DrizzleRulesWriteRepository();
  const rulesReads = new DrizzleRulesReadRepository();
  const planningWrites = new DrizzlePlanningWriteRepository();
  const conversationWrites = new DrizzleConversationWriteRepository();

  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  const createdRuleIds: number[] = [];

  afterAll(async () => {
    for (const id of createdRuleIds) {
      await db.delete(rules).where(eq(rules.id, id));
    }
    await db.delete(plans).where(eq(plans.ruleSetVersion, "PARITY-TEST"));
  });

  const makeTestRule = (ruleId: string, name: string) => ({
    dslVersion: "SOCILA-DSL-1.0",
    ruleId,
    name,
    module: "parity",
    status: "draft",
    priority: 999,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    supersedes: [],
    decisionTable: { hit_policy: "first", rows: [] },
    inputs: [],
    parameterRefs: [],
    outputs: [],
    examples: [],
    evidence: [],
  });

  it("CRUD: insert → read → update a rule", async () => {
    const inserted = await rulesWrites.insertRule(
      makeTestRule("R-PARITY-TEST", "对账测试规则"),
    );
    createdRuleIds.push(inserted.id);

    const read = await rulesReads.getRule("R-PARITY-TEST");
    expect(read?.id).toBe(inserted.id);

    const updated = await rulesWrites.updateRule(inserted.id, {
      status: "published",
    });
    expect(updated?.status).toBe("published");
  });

  it("rollback: a throwing transaction leaves no rows behind", async () => {
    const before = (await rulesReads.listRules({ module: "parity" })).length;
    await expect(
      withTransaction(async (tx) => {
        await rulesWrites.insertRule(
          makeTestRule("R-PARITY-ROLLBACK", "应被回滚"),
          tx,
        );
        throw new Error("force-rollback");
      }),
    ).rejects.toThrow("force-rollback");
    const after = (await rulesReads.listRules({ module: "parity" })).length;
    expect(after).toBe(before);
  });

  it("concurrency: parallel inserts all persist; conflict path returns existing once", async () => {
    const saved = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        planningWrites.savePlan({
          userInput: { i },
          ruleSetVersion: "PARITY-TEST",
        }),
      ),
    );
    expect(saved).toHaveLength(5);
    expect(new Set(saved.map((p) => p.id)).size).toBe(5);

    // 并发创建同 id 会话：一个成功，另一个走冲突回读（不产生第二行）。
    const id = crypto.randomUUID();
    const [a, b] = await Promise.all([
      conversationWrites.createConversation({ id, sessionId: "conc-a" }),
      conversationWrites.createConversation({ id, sessionId: "conc-a" }),
    ]);
    expect(a?.id).toBe(id);
    expect(b?.id).toBe(id);
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    expect(rows).toHaveLength(1);

    // 跨 session 冲突：返回 null（归属校验），且不删除既有会话。
    const foreign = await conversationWrites.createConversation({
      id,
      sessionId: "conc-b",
    });
    expect(foreign).toBeNull();
  });
});
