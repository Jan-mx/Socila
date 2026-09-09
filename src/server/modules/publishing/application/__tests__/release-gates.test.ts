/**
 * 任务3（JRP-FR-007/JRP-AC-007）：激活门禁真实执行专用测试。
 *
 * - 七道门禁（引用/Schema/参数依赖/冲突/黄金/双重重放/内容哈希）全部真实执行；
 * - 任一 fail → ok=false 且不写入任何 pass；
 * - 伪造 pass 不能绕过（用例层不再允许直接写 snapshot_replay=pass）。
 */
import { describe, it, expect, vi } from "vitest";
import {
  runReleaseGates,
  canonicalMemberHash,
  RELEASE_GATE_KEYS,
  type ReleaseGateDeps,
} from "../release-gates";

function makeRulePayload(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: "R-120-COMPUTE-RETIRE-DATE",
    businessKey: "R-120-COMPUTE-RETIRE-DATE",
    name: "退休日期",
    module: "retirement",
    dslVersion: "SOCILA-DSL-1.0",
    status: "published",
    priority: 120,
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    supersedes: [],
    inputs: [],
    parameterRefs: [],
    decisionTable: { hit_policy: "first", rows: [] },
    outputs: [],
    examples: [],
    evidence: [
      {
        document_id: "gd-doc-1",
        content_sha256: "abc",
        excerpt: "摘录",
        artifact: "evidence/gd/original.html",
      },
    ],
    ...overrides,
  };
}

function makeParamPayload(overrides: Record<string, unknown> = {}) {
  return {
    paramId: "P-GD-UNEMPLOYMENT-BENEFIT-RATE",
    businessKey: "P-GD-UNEMPLOYMENT-BENEFIT-RATE",
    type: "number",
    value: 0.9,
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    ...overrides,
  };
}

function makeSnap(overrides: Record<string, unknown> = {}) {
  const members: ReleaseGateDeps["snapshot"]["members"] = [
    {
      entityType: "rule" as const,
      businessKey: "R-120-COMPUTE-RETIRE-DATE",
      payload: makeRulePayload(),
      provenance: [],
    },
    {
      entityType: "param" as const,
      businessKey: "P-GD-UNEMPLOYMENT-BENEFIT-RATE",
      payload: makeParamPayload(),
      provenance: [],
    },
    {
      entityType: "rule_set" as const,
      businessKey: "RS-GD-PLAN-V1",
      payload: {
        ruleSetId: "RS-GD-PLAN-V1",
        rules: ["R-120-COMPUTE-RETIRE-DATE"],
        version: 1,
      },
      provenance: [],
    },
  ];
  return {
    snapshot: {
      id: "snap-1",
      jurisdictionCode: "440000",
      contentHash: canonicalMemberHash(members),
      asOfDate: "2026-09-07",
      ...overrides,
    },
    members,
  };
}

/** 一条必然通过的黄金测试（空 expected 深度部分匹配，JRP-FR-007 至少一条）。 */
function passingGoldenTest() {
  return [
    {
      id: 1,
      name: "R-120 基础通过",
      jurisdictionCode: "440000",
      ruleId: "R-120-COMPUTE-RETIRE-DATE",
      input: { user: { basic: { gender: "male", birth_year: 1973 } } },
      paramsOverride: null,
      expected: {},
      source: "manual",
      lastRunResult: null,
      lastRunAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

function makeDeps(overrides: Record<string, unknown> = {}): ReleaseGateDeps {
  return {
    snapshot: makeSnap(),
    jurisdictionCode: "440000",
    listOpenConflicts: vi.fn(async () => []),
    loadTests: vi.fn(async () => passingGoldenTest() as never),
    verifyEvidence: vi.fn(() => ({
      verified: true,
      errors: [],
      checked: 1,
    })),
    ...overrides,
  };
}

describe("激活门禁（JRP-FR-007/AC-007）", () => {
  it("全部门禁真实通过：gateResults 七项全为 pass", async () => {
    const out = await runReleaseGates(makeDeps());
    expect(out.ok).toBe(true);
    for (const key of RELEASE_GATE_KEYS) {
      expect(out.gateResults[key], key).toBe("pass");
    }
    expect(out.errors).toEqual([]);
  });

  it("引用门禁失败：真实校验证据（伪造 pass 不能绕过）", async () => {
    const out = await runReleaseGates(
      makeDeps({
        verifyEvidence: vi.fn(() => ({
          verified: false,
          errors: ["440000: 摘录未在原文中找到"],
          checked: 1,
        })),
      }),
    );
    expect(out.ok).toBe(false);
    expect(out.gateResults.reference).toEqual({
      fail: "440000: 摘录未在原文中找到",
    });
    expect(out.gateResults.content_hash).toBe("pass"); // 其余门禁照常执行
  });

  it("Schema 门禁失败：畸形规则被 JSON-Schema 拦截", async () => {
    const snap = makeSnap();
    snap.members[0] = {
      ...snap.members[0],
      payload: makeRulePayload({ decisionTable: { hit_policy: "bogus", rows: [] } }),
    };
    snap.snapshot.contentHash = canonicalMemberHash(snap.members);
    const out = await runReleaseGates(makeDeps({ snapshot: snap }));
    expect(out.ok).toBe(false);
    expect(out.gateResults.schema).not.toBe("pass");
    expect(out.errors.join("; ")).toContain("schema");
  });

  it("参数依赖门禁失败：parameter_refs 指向快照外参数", async () => {
    const snap = makeSnap();
    snap.members[0] = {
      ...snap.members[0],
      payload: makeRulePayload({
        parameterRefs: [{ param_id: "P-NOT-IN-SNAPSHOT" }],
      }),
    };
    snap.snapshot.contentHash = canonicalMemberHash(snap.members);
    const out = await runReleaseGates(makeDeps({ snapshot: snap }));
    expect(out.ok).toBe(false);
    expect(out.gateResults.param_deps).not.toBe("pass");
  });

  it("冲突门禁失败：地区存在未解决冲突阻止激活（JRP-AC-007）", async () => {
    const out = await runReleaseGates(
      makeDeps({
        listOpenConflicts: vi.fn(async () => [{ id: 1, status: "open" }]),
      }),
    );
    expect(out.ok).toBe(false);
    expect(out.gateResults.conflicts).not.toBe("pass");
  });

  it("空黄金测试集 fail-closed：无适用测试地区不能绕过黄金门禁（JRP-FR-007/AC-007）", async () => {
    const out = await runReleaseGates(
      makeDeps({ loadTests: vi.fn(async () => []) }),
    );
    expect(out.ok).toBe(false);
    expect(out.gateResults.golden_tests).not.toBe("pass");
    expect(out.errors.join("; ")).toContain("golden_tests");
  });

  it("黄金测试门禁失败：快照重放与期望不一致", async () => {
    const out = await runReleaseGates(
      makeDeps({
        loadTests: vi.fn(async () => [
          {
            id: 1,
            name: "期望不符测试",
            jurisdictionCode: "440000",
            ruleId: "R-120-COMPUTE-RETIRE-DATE",
            input: { user: { basic: { gender: "male", birth_year: 1973 } } },
            paramsOverride: null,
            expected: { retirement: { legal_retire_date: "9999-01-01" } },
            source: "manual",
            lastRunResult: null,
            lastRunAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      }),
    );
    expect(out.ok).toBe(false);
    expect(out.gateResults.golden_tests).not.toBe("pass");
  });

  it("内容哈希门禁失败：成员被篡改（hash 漂移）→ fail-closed", async () => {
    const snap = makeSnap();
    snap.members[0] = {
      ...snap.members[0],
      payload: makeRulePayload({ name: "被篡改的名称" }),
    };
    // contentHash 保持原值（= 漂移）。
    const out = await runReleaseGates(makeDeps({ snapshot: snap }));
    expect(out.ok).toBe(false);
    expect(out.gateResults.content_hash).not.toBe("pass");
    expect(out.errors.join("; ")).toContain("content_hash");
  });

  it("双重重放确定性：两次执行逐字节一致即 pass", async () => {
    const out = await runReleaseGates(makeDeps());
    expect(out.gateResults.replay_twice).toBe("pass");
  });

  it("gateResults 键集合固定（七道门禁，防缺项）", () => {
    expect(RELEASE_GATE_KEYS).toEqual([
      "reference",
      "schema",
      "param_deps",
      "conflicts",
      "golden_tests",
      "replay_twice",
      "content_hash",
    ]);
  });
});