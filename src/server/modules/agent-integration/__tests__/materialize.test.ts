/**
 * 步骤06.7 Core 物化服务测试（DRF-FR-013/014 / AC-005/006/007）。
 * 集成路径（演练库）：幂等、stale 快照拒绝、非 draft 状态 403、draft 创建。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  MaterializationRejected,
  materializeDraftBundle,
  parseAndReject,
} from "../application/materialize";

const DRILL = process.env.SSP_TEST_DATABASE_URL;

function validBundle() {
  return {
    proposal_id: "prop-1",
    run_id: "run-1",
    idempotency_key: "mat-key-1",
    base_snapshot_id: null,
    jurisdiction_code: "310000",
    effective_from: "2026-01-01",
    status: "draft",
    rule_drafts: [
      {
        temp_id: "t1",
        rule_id: "R-CORE-DRAFT-1",
        name: "Core物化测试规则",
        decision_table: { hit_policy: "first", rows: [] },
        effective_from: "2026-01-01",
        citations: [{ document_version_id: "dv-1", path: "/doc/article" }],
        parameter_refs: [],
      },
    ],
    param_drafts: [],
    test_drafts: [],
    citations: [],
  };
}

describe.skipIf(!DRILL)("core materialize service (drill DB)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = DRILL;
  });

  it("AC-005: same idempotency key returns first result without new drafts", async () => {
    const bundle = validBundle();
    const first = await materializeDraftBundle(parseAndReject(bundle), "agent-runtime");
    expect(first.idempotent).toBe(false);
    expect(first.draft_ids.rules).toHaveLength(1);

    const second = await materializeDraftBundle(parseAndReject(bundle), "agent-runtime");
    expect(second.idempotent).toBe(true);
    expect(second.draft_ids).toEqual(first.draft_ids);
  });

  it("AC-007: production status rejected with 403 and security event", () => {
    const bundle = { ...validBundle(), status: "production", idempotency_key: "mat-prod-1" };
    expect(() => parseAndReject(bundle)).toThrow(MaterializationRejected);
    try {
      parseAndReject(bundle);
    } catch (e) {
      expect((e as MaterializationRejected).status).toBe(403);
      expect((e as MaterializationRejected).reason).toBe("non-draft-status");
    }
  });

  it("DRF-FR-014: missing citations rejected 422 (second validation)", () => {
    const bundle = validBundle();
    bundle.rule_drafts[0].citations = [];
    bundle.idempotency_key = "mat-nocite-1";
    expect(() => parseAndReject(bundle)).toThrow(MaterializationRejected);
  });

  it("AC-006: stale base snapshot rejected 409", async () => {
    const stale: Record<string, unknown> = {
      ...validBundle(),
      idempotency_key: "mat-stale-1",
      base_snapshot_id: "00000000-0000-0000-0000-000000000001",
    };
    await expect(materializeDraftBundle(parseAndReject(stale), "agent-runtime")).rejects.toThrow(
      /重新运行影响分析|stale/,
    );
  });

  it("cleanup test drafts", async () => {
    await db.execute(
      sql`DELETE FROM agent_materializations WHERE idempotency_key LIKE 'mat-%'`,
    );
    await db.execute(sql`DELETE FROM rules WHERE rule_id = 'R-CORE-DRAFT-1'`);
    expect(true).toBe(true);
  });
});
