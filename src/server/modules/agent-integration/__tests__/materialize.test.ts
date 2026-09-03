/**
 * 步骤06.7 Core 物化服务纯测试（DRF-FR-013/014 / AC-007）：
 * 二次校验拒绝（非 draft 状态 403、引用缺失 422），不依赖数据库。
 * 真库集成部分（AC-005 幂等 / AC-006 stale 拒绝）见 materialize.integration.test.ts。
 */
import { describe, it, expect } from "vitest";
import { MaterializationRejected, parseAndReject } from "../application/materialize";

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

describe("core materialize parseAndReject (pure)", () => {
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
});
