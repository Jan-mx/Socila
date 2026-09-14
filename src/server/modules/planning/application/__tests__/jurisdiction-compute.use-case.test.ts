/**
 * 任务3（JRP-FR/AC，09-05-feature-jurisdiction-aware-planning）：
 * 地区感知规划核心用例 `computeJurisdictionPlan` 的专用测试。
 *
 * 覆盖（对应执行要求列）：
 * - 必填地区代码（JRP-AC-001/FR-001）；
 * - 未知地区 422（JRP-AC-002）；
 * - 已存在但未激活（四川510000）422 且不读取任何快照（JRP-AC-003/017）；
 * - 请求地区、画像地区、活动快照地区不一致 fail-closed（JRP-NFR-003/008）；
 * - 活动快照缺失 409（JRP-FR-004）；
 * - 未解决冲突 409（JRP-AC-007）；
 * - 成功路径：快照驱动执行、plan 留痕 jurisdiction/snapshot/path（JRP-AC-004/FR-009）；
 * - 不默认上海、不回退其他地区（PRD §3/§9 兼容约束）。
 *
 * 全部依赖注入：单元测试零数据库依赖（JRP-NFR-007）。
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi } from "vitest";
import type { PlanningWriteRepository } from "../write-ports";
import {
  computeJurisdictionPlan,
  JurisdictionRequiredError,
  JurisdictionInvalidError,
  JurisdictionUnsupportedError,
  PolicySnapshotUnavailableError,
  PolicyConflictError,
  JurisdictionContextMismatchError,
  PolicyStoreUnavailableError,
  type ComputeJurisdictionPlanDeps,
} from "../jurisdiction-compute.use-case";

const CHAIN_310000 = [
  { code: "CN", name: "中国", level: "national", path: "/CN/" },
  { code: "310000", name: "上海市", level: "province", path: "/CN/310000/" },
];
const CHAIN_440000 = [
  { code: "CN", name: "中国", level: "national", path: "/CN/" },
  { code: "440000", name: "广东省", level: "province", path: "/CN/440000/" },
];

import {
  canonicalMemberHash,
} from "@/server/modules/publishing/application/release-gates";

function makeSnap(snapshotId: string, jurisdictionCode: string) {
  const members = [
    {
      id: 1,
      snapshotId,
      entityType: "rule" as const,
      businessKey: "R-120-COMPUTE-RETIRE-DATE",
      payload: {
        ruleId: "R-120-COMPUTE-RETIRE-DATE",
        name: "退休日期",
        module: "retirement",
        dslVersion: "SOCILA-DSL-1.0",
        status: "published",
        priority: 120,
        effectiveFrom: "2025-01-01",
        supersedes: [],
        inputs: [],
        parameterRefs: [],
        decisionTable: { hit_policy: "first", rows: [] },
        outputs: [],
        examples: [],
        evidence: [],
      },
      provenance: [],
    },
  ];
  return {
    snapshot: {
      id: snapshotId,
      jurisdictionCode,
      asOfDate: "2026-09-01",
      resolvedPath: `/CN/${jurisdictionCode}/`,
      contentHash: canonicalMemberHash(members),
      createdBy: "admin",
      createdAt: new Date("2026-09-07T08:00:00Z"),
    },
    members,
  };
}

function baseDeps(overrides: Record<string, unknown> = {}) {
  const runEngine = vi.fn<NonNullable<ComputeJurisdictionPlanDeps["runEngine"]>>(
    async () => ({
      plan: {},
      calc: {},
      user: {},
      trace: [],
      meta: {
        rule_set_id: "RS-SNAPSHOT",
        policy_pack_id: "SNAPSHOT",
        rules_executed: 1,
        as_of_date: "2026-09-01",
      },
      effectiveRules: [],
      flatParams: {},
    }),
  );
  const savePlan = vi.fn(async (data: Record<string, unknown>) => ({
    id: "plan-1",
    ...data,
  })) as unknown as PlanningWriteRepository["savePlan"];
  const deps = {
    resolveChain: vi.fn(async (code: string) =>
      code === "310000"
        ? CHAIN_310000
        : code === "440000"
          ? CHAIN_440000
          : code === "510000"
            ? [{ code: "CN", name: "中国", level: "national", path: "/CN/" },
               { code: "510000", name: "四川省", level: "province", path: "/CN/510000/" }]
            : (() => {
                throw new Error("not-found");
              })(),
    ),
    getActiveRelease: vi.fn(async () => null),
    hasAnyRelease: vi.fn(async () => false),
    getSnapshot: vi.fn(async () => null),
    listOpenConflicts: vi.fn(async () => []),
    runEngine,
    savePlan,
    ...overrides,
  };
  return deps;
}

describe("computeJurisdictionPlan（JRP 地区感知规划核心用例）", () => {
  it("缺少地区代码：拒绝计算且不执行任何引擎与落库（JRP-AC-001/FR-001）", async () => {
    const deps = baseDeps();
    await expect(
      computeJurisdictionPlan({ user: {}, jurisdictionCode: "" }, deps),
    ).rejects.toBeInstanceOf(JurisdictionRequiredError);
    expect(deps.runEngine).not.toHaveBeenCalled();
    expect(deps.savePlan).not.toHaveBeenCalled();
  });

  it("未知地区：422 JURISDICTION_INVALID（JRP-AC-002）", async () => {
    const deps = baseDeps();
    await expect(
      computeJurisdictionPlan({ user: {}, jurisdictionCode: "999999" }, deps),
    ).rejects.toBeInstanceOf(JurisdictionInvalidError);
    expect(deps.runEngine).not.toHaveBeenCalled();
    expect(deps.savePlan).not.toHaveBeenCalled();
    // 未知地区不得触发任何快照读取（严禁回退默认地区）。
    expect(deps.getSnapshot).not.toHaveBeenCalled();
  });

  it("存在但未激活（四川510000）：422 JURISDICTION_UNSUPPORTED，不读取上海或广东快照（JRP-AC-003/017）", async () => {
    const deps = baseDeps();
    await expect(
      computeJurisdictionPlan({ user: {}, jurisdictionCode: "510000" }, deps),
    ).rejects.toBeInstanceOf(JurisdictionUnsupportedError);
    expect(deps.getSnapshot).not.toHaveBeenCalled();
    expect(deps.runEngine).not.toHaveBeenCalled();
    expect(deps.savePlan).not.toHaveBeenCalled();
    // 必须查询请求地区自身的发布记录，不得查询其他地区。
    expect(deps.getActiveRelease).toHaveBeenCalledTimes(1);
    expect((deps.getActiveRelease as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("510000");
  });

  it("活动发布记录存在但缺少快照：409 POLICY_SNAPSHOT_UNAVAILABLE（JRP-FR-004/AC-011 场景）", async () => {
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: null,
        status: "active",
        gateResults: {
          reference: "pass",
          schema: "pass",
          param_deps: "pass",
          conflicts: "pass",
          golden_tests: "pass",
          replay_twice: "pass",
          content_hash: "pass",
        },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
    });
    await expect(
      computeJurisdictionPlan({ user: {}, jurisdictionCode: "310000" }, deps),
    ).rejects.toBeInstanceOf(PolicySnapshotUnavailableError);
    expect(deps.runEngine).not.toHaveBeenCalled();
    expect(deps.savePlan).not.toHaveBeenCalled();
  });

  it("活动快照读取缺失（记录指向不存在的快照）：409 POLICY_SNAPSHOT_UNAVAILABLE，不执行", async () => {
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "missing-snapshot",
        status: "active",
        gateResults: {
          reference: "pass",
          schema: "pass",
          param_deps: "pass",
          conflicts: "pass",
          golden_tests: "pass",
          replay_twice: "pass",
          content_hash: "pass",
        },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      getSnapshot: vi.fn(async () => null),
    });
    await expect(
      computeJurisdictionPlan({ user: {}, jurisdictionCode: "310000" }, deps),
    ).rejects.toBeInstanceOf(PolicySnapshotUnavailableError);
    expect(deps.runEngine).not.toHaveBeenCalled();
    expect(deps.savePlan).not.toHaveBeenCalled();
  });

  it("地区存在未解决冲突：409 POLICY_CONFLICT（JRP-AC-007）", async () => {
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "snap-1",
        status: "active",
        gateResults: {
          reference: "pass",
          schema: "pass",
          param_deps: "pass",
          conflicts: "pass",
          golden_tests: "pass",
          replay_twice: "pass",
          content_hash: "pass",
        },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      getSnapshot: vi.fn(async () => makeSnap("snap-1", "310000")),
      listOpenConflicts: vi.fn(async () => [
        { id: 1, jurisdictionCode: "310000", kind: "same-level-overlap" },
      ]),
    });
    await expect(
      computeJurisdictionPlan({ user: {}, jurisdictionCode: "310000" }, deps),
    ).rejects.toBeInstanceOf(PolicyConflictError);
    expect(deps.runEngine).not.toHaveBeenCalled();
    expect(deps.savePlan).not.toHaveBeenCalled();
  });

  it("请求地区与会话画像地区不一致：409 JURISDICTION_CONTEXT_MISMATCH，画像/plan/快照引用均不变（JRP-AC-015/NFR-008）", async () => {
    const deps = baseDeps();
    await expect(
      computeJurisdictionPlan(
        {
          user: {},
          jurisdictionCode: "310000",
          confirmedJurisdictionCode: "440000",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(JurisdictionContextMismatchError);
    expect(deps.runEngine).not.toHaveBeenCalled();
    expect(deps.savePlan).not.toHaveBeenCalled();
    // 未执行任何快照读取（上下文不一致先于快照解析失败）。
    expect(deps.getSnapshot).not.toHaveBeenCalled();
  });

  it("活动快照地区与服务端校验后的请求地区不一致：fail-closed，不执行不落库（JRP-NFR-003 执行要求3）", async () => {
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "snap-x",
        status: "active",
        gateResults: {
          reference: "pass",
          schema: "pass",
          param_deps: "pass",
          conflicts: "pass",
          golden_tests: "pass",
          replay_twice: "pass",
          content_hash: "pass",
        },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      // 快照地区与发布记录/请求地区不一致（数据损坏信号）。
      getSnapshot: vi.fn(async () => makeSnap("snap-x", "440000")),
    });
    await expect(
      computeJurisdictionPlan({ user: {}, jurisdictionCode: "310000" }, deps),
    ).rejects.toBeInstanceOf(PolicyStoreUnavailableError);
    expect(deps.runEngine).not.toHaveBeenCalled();
    expect(deps.savePlan).not.toHaveBeenCalled();
  });

  it("成功：只执行活动快照成员并保存 jurisdiction/snapshot/path/asOfDate 留痕（JRP-AC-004/FR-009）", async () => {
    const runEngine = vi.fn(async () => ({
      plan: { retirement: {} },
      calc: {},
      user: {},
      trace: [],
      meta: {
        rule_set_id: "RS-SHANGHAI-PLAN-V1",
        policy_pack_id: "SHANGHAI_BASE",
        as_of_date: "2026-09-01",
        rules_executed: 1,
      },
      effectiveRules: [],
      flatParams: {},
    }));
    const savePlan = vi.fn(async (data: Record<string, unknown>) => ({
      id: "plan-1",
      ...data,
    }));
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "snap-1",
        status: "active",
        gateResults: {
        reference: "pass",
        schema: "pass",
        param_deps: "pass",
        conflicts: "pass",
        golden_tests: "pass",
        replay_twice: "pass",
        content_hash: "pass",
      },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      getSnapshot: vi.fn(async () => makeSnap("snap-1", "310000")),
      runEngine,
      savePlan,
    });

    const snap = makeSnap("snap-1", "310000");

    const result = await computeJurisdictionPlan(
      {
        user: { basic: { gender: "male" } },
        jurisdictionCode: "310000",
        asOfDate: "2026-09-01",
        ownerUserId: "user-1",
      },
      deps,
    );

    expect(runEngine).toHaveBeenCalledTimes(1);
    expect(savePlan).toHaveBeenCalledTimes(1);
    const saved = savePlan.mock.calls[0][0] as Record<string, unknown>;
    expect(saved.jurisdictionCode).toBe("310000");
    expect(saved.snapshotId).toBe("snap-1");
    // JRP-FR-009/FR-028：plan 必须保存快照内容 hash 供历史重放三方校验。
    expect(saved.snapshotContentHash).toBe(snap.snapshot.contentHash);
    expect(saved.resolvedJurisdictionPath).toBe("/CN/310000/");
    expect(saved.asOfDate).toBe("2026-09-01");
    expect(result.planId).toBe("plan-1");
    expect(result.meta).toMatchObject({
      jurisdiction_code: "310000",
      snapshot_id: "snap-1",
      resolved_jurisdiction_path: "/CN/310000/",
      as_of_date: "2026-09-01",
    });
  });

  it("不默认上海：广东请求只查询广东发布记录并使用广东快照（JRP-NFR-003 执行要求4）", async () => {
    const runEngine = vi.fn(async () => ({
      plan: {},
      calc: {},
      user: {},
      trace: [],
      meta: {
        rule_set_id: "RS-GD-PLAN-V1",
        policy_pack_id: "GD-BASE",
        as_of_date: "2026-09-01",
        rules_executed: 1,
      },
      effectiveRules: [],
      flatParams: {},
    }));
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 2,
        jurisdictionCode: "440000",
        activeSnapshotId: "snap-gd",
        status: "active",
        gateResults: {
          reference: "pass",
          schema: "pass",
          param_deps: "pass",
          conflicts: "pass",
          golden_tests: "pass",
          replay_twice: "pass",
          content_hash: "pass",
        },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      getSnapshot: vi.fn(async () => makeSnap("snap-gd", "440000")),
      runEngine,
    });

    await computeJurisdictionPlan(
      {
        user: { basic: { gender: "female" } },
        jurisdictionCode: "440000",
        asOfDate: "2026-09-01",
        ownerUserId: "user-1",
      },
      deps,
    );

    expect(deps.getActiveRelease).toHaveBeenCalledTimes(1);
    expect(deps.getActiveRelease).toHaveBeenCalledWith("440000", "2026-09-01");
    expect(deps.getSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.getSnapshot).toHaveBeenCalledWith("snap-gd");
    // 引擎必须收到从广东快照还原的规则与参数（不含上海规则集ID注入）。
    const engineInput = deps.runEngine.mock.calls[0]?.[0] as unknown as
      | Record<string, unknown>
      | undefined;
    expect(engineInput).toBeDefined();
    expect(engineInput?.rule_set_id).not.toBe("RS-SHANGHAI-PLAN-V1");
    expect(engineInput?.policy_pack_id).not.toBe("SHANGHAI_BASE");
  });
});
describe("广东领取地市代码（JRP-FR-022/023/AC-006）", () => {
  function gdDeps(overrides: Record<string, unknown> = {}) {
    const runEngine = vi.fn<
      NonNullable<ComputeJurisdictionPlanDeps["runEngine"]>
    >(async (engineInput) => ({
      plan: {},
      calc: {},
      user: engineInput.user,
      trace: [],
      meta: {
        rule_set_id: "RS-GD-PLAN-V1",
        policy_pack_id: "GD-BASE",
        rules_executed: 1,
        as_of_date: engineInput.asOfDate,
      },
      effectiveRules: [],
      flatParams: {},
    }));
    return baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 2,
        jurisdictionCode: "440000",
        activeSnapshotId: "snap-gd",
        status: "active",
        gateResults: {
        reference: "pass",
        schema: "pass",
        param_deps: "pass",
        conflicts: "pass",
        golden_tests: "pass",
        replay_twice: "pass",
        content_hash: "pass",
      },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      getSnapshot: vi.fn(async () => makeSnap("snap-gd", "440000")),
      runEngine,
      ...overrides,
    });
  }

  it("有效广东领取地市代码：服务端转换为规则内部 claim_city 后执行（JRP-AC-006）", async () => {
    const deps = gdDeps();
    await computeJurisdictionPlan(
      {
        user: {
          basic: { gender: "male", birth_year: 1973 },
          profile: { claim_city_code: "440100" },
        },
        jurisdictionCode: "440000",
        asOfDate: "2026-09-07",
        ownerUserId: "user-1",
      },
      deps,
    );
    const engineInput = (deps.runEngine as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { user: Record<string, unknown> };
    // 引擎输入：claim_city_code 规范化后的 claim_city，代码本身不再进入引擎。
    expect(engineInput.user).toMatchObject({
      profile: { claim_city: "广州" },
    });
    expect(
      (engineInput.user.profile as Record<string, unknown>).claim_city_code,
    ).toBeUndefined();
  });

  it("缺失领取地市代码：不注入 claim_city（规则按缺失处理不估算金额）（JRP-AC-006）", async () => {
    const deps = gdDeps();
    await computeJurisdictionPlan(
      {
        user: { basic: { gender: "male", birth_year: 1973 } },
        jurisdictionCode: "440000",
        asOfDate: "2026-09-07",
        ownerUserId: "user-1",
      },
      deps,
    );
    const engineInput = (deps.runEngine as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { user: Record<string, unknown> };
    expect(engineInput.user.profile).toBeUndefined();
  });

  it("未知城市代码（非广东地级市）：不注入 claim_city，不估算金额（JRP-AC-006）", async () => {
    const deps = gdDeps();
    await computeJurisdictionPlan(
      {
        user: {
          basic: { gender: "male", birth_year: 1973 },
          profile: { claim_city_code: "999999" },
        },
        jurisdictionCode: "440000",
        asOfDate: "2026-09-07",
        ownerUserId: "user-1",
      },
      deps,
    );
    const engineInput = (deps.runEngine as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { user: Record<string, unknown> };
    const profile = engineInput.user.profile as Record<string, unknown> | undefined;
    expect(profile?.claim_city).toBeUndefined();
    expect(profile?.claim_city_code).toBeUndefined();
  });

  it("跨省代码（如上海代码提交给广东）：不注入 claim_city，不估算金额（JRP-AC-006）", async () => {
    const deps = gdDeps();
    await computeJurisdictionPlan(
      {
        user: {
          basic: { gender: "male", birth_year: 1973 },
          profile: { claim_city_code: "310000" },
        },
        jurisdictionCode: "440000",
        asOfDate: "2026-09-07",
        ownerUserId: "user-1",
      },
      deps,
    );
    const engineInput = (deps.runEngine as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { user: Record<string, unknown> };
    const profile = engineInput.user.profile as Record<string, unknown> | undefined;
    expect(profile?.claim_city).toBeUndefined();
    expect(profile?.claim_city_code).toBeUndefined();
  });

  it("非广东地区（上海）提交代码：不参与计算（跨省拒绝，JRP-FR-023）", async () => {
    const runEngine = vi.fn<
      NonNullable<ComputeJurisdictionPlanDeps["runEngine"]>
    >(async (engineInput) => ({
      plan: {},
      calc: {},
      user: engineInput.user,
      trace: [],
      meta: {
        rule_set_id: "RS-SHANGHAI-PLAN-V1",
        policy_pack_id: "SHANGHAI_BASE",
        rules_executed: 1,
        as_of_date: engineInput.asOfDate,
      },
      effectiveRules: [],
      flatParams: {},
    }));
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "snap-1",
        status: "active",
        gateResults: {
        reference: "pass",
        schema: "pass",
        param_deps: "pass",
        conflicts: "pass",
        golden_tests: "pass",
        replay_twice: "pass",
        content_hash: "pass",
      },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      getSnapshot: vi.fn(async () => makeSnap("snap-1", "310000")),
      runEngine,
    });
    await computeJurisdictionPlan(
      {
        user: {
          basic: { gender: "male", birth_year: 1973 },
          profile: { claim_city_code: "440100" },
        },
        jurisdictionCode: "310000",
        asOfDate: "2026-09-07",
        ownerUserId: "user-1",
      },
      deps,
    );
    const engineInput = (runEngine as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      user: Record<string, unknown>;
    };
    const profile = engineInput.user.profile as Record<string, unknown> | undefined;
    expect(profile?.claim_city).toBeUndefined();
    expect(profile?.claim_city_code).toBeUndefined();
  });
});

describe("快照区间选择（JRP-FR-004/024/AC-005）", () => {
  function releaseWithRange(overrides: Record<string, unknown> = {}) {
    return {
      id: 3,
      jurisdictionCode: "440000",
      activeSnapshotId: "snap-gd-2026",
      status: "active" as const,
      gateResults: {
        reference: "pass",
        schema: "pass",
        param_deps: "pass",
        conflicts: "pass",
        golden_tests: "pass",
        replay_twice: "pass",
        content_hash: "pass",
      },
      activatedAt: new Date("2026-09-07T08:00:00Z"),
      activatedBy: "admin",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2029-12-31",
      updatedAt: new Date("2026-09-07T08:00:00Z"),
      ...overrides,
    };
  }

  it("日期落在 active 区间内：命中该区间并返回区间元数据（JRP-AC-004）", async () => {
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) =>
        releaseWithRange(),
      ),
      hasAnyRelease: vi.fn(async () => true),
      getSnapshot: vi.fn(async () => makeSnap("snap-gd-2026", "440000")),
    });
    const result = await computeJurisdictionPlan(
      {
        user: { basic: { gender: "male", birth_year: 1973 } },
        jurisdictionCode: "440000",
        asOfDate: "2029-06-01",
        ownerUserId: "user-1",
      },
      deps,
    );
    expect(result.meta).toMatchObject({
      release_effective_from: "2026-01-01",
      release_effective_to: "2029-12-31",
    });
  });

  it("有发布记录但日期不在任何 active 区间：409 POLICY_SNAPSHOT_UNAVAILABLE 零执行（JRP-AC-005）", async () => {
    const deps = baseDeps({
      getActiveRelease: vi.fn(async () => null),
      hasAnyRelease: vi.fn(async () => true),
      getSnapshot: vi.fn(async () => null),
    });
    await expect(
      computeJurisdictionPlan(
        {
          user: { basic: { gender: "male", birth_year: 1973 } },
          jurisdictionCode: "440000",
          asOfDate: "2035-01-01",
          ownerUserId: "user-1",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(PolicySnapshotUnavailableError);
    expect(deps.runEngine).not.toHaveBeenCalled();
    expect(deps.savePlan).not.toHaveBeenCalled();
  });

  it("区间防御复核：仓储返回的区间不覆盖 as_of_date 时 fail-closed（JRP-NFR-003）", async () => {
    // 构造仓储返回释放但在 as_of_date 之前的区间（不应发生的漂移）。
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) =>
        releaseWithRange({ effectiveTo: "2020-12-31" }),
      ),
      hasAnyRelease: vi.fn(async () => true),
      getSnapshot: vi.fn(async () => null),
    });
    await expect(
      computeJurisdictionPlan(
        {
          user: { basic: { gender: "male", birth_year: 1973 } },
          jurisdictionCode: "440000",
          asOfDate: "2035-01-01",
          ownerUserId: "user-1",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(PolicySnapshotUnavailableError);
    expect(deps.runEngine).not.toHaveBeenCalled();
  });
});

describe("执行期完整性（JRP-FR-026/AC-005）", () => {
  function fullGates() {
    return {
      reference: "pass",
      schema: "pass",
      param_deps: "pass",
      conflicts: "pass",
      golden_tests: "pass",
      replay_twice: "pass",
      content_hash: "pass",
    };
  }

  it("快照成员被篡改（hash 漂移）：409 且零执行（JRP-AC-005）", async () => {
    const snap = makeSnap("snap-1", "310000");
    snap.members[0] = {
      ...snap.members[0],
      payload: {
        ...snap.members[0].payload,
        name: "被篡改的名称",
      },
    };
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "snap-1",
        status: "active",
        gateResults: fullGates(),
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      getSnapshot: vi.fn(async () => snap),
    });
    await expect(
      computeJurisdictionPlan(
        {
          user: { basic: { gender: "male" } },
          jurisdictionCode: "310000",
          asOfDate: "2026-09-01",
          ownerUserId: "user-1",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(PolicySnapshotUnavailableError);
    expect(deps.runEngine).not.toHaveBeenCalled();
    expect(deps.savePlan).not.toHaveBeenCalled();
  });

  it("gateResults 缺项（只有部分门禁）：409 fail-closed（JRP-FR-026/AC-005）", async () => {
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "snap-1",
        status: "active",
        gateResults: { reference: "pass", conflicts: "pass" },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      getSnapshot: vi.fn(async () => makeSnap("snap-1", "310000")),
    });
    await expect(
      computeJurisdictionPlan(
        {
          user: { basic: { gender: "male" } },
          jurisdictionCode: "310000",
          asOfDate: "2026-09-01",
          ownerUserId: "user-1",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(PolicySnapshotUnavailableError);
    expect(deps.runEngine).not.toHaveBeenCalled();
  });

  it("伪造 gateResults（snapshot_replay=pass 等非标准键）：409 fail-closed（JRP-AC-007）", async () => {
    const deps = baseDeps({
      getActiveRelease: vi.fn(async (_code, _asOfDate) => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "snap-1",
        status: "active",
        gateResults: { snapshot_replay: "pass", conflicts: "pass" },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      getSnapshot: vi.fn(async () => makeSnap("snap-1", "310000")),
    });
    await expect(
      computeJurisdictionPlan(
        {
          user: { basic: { gender: "male" } },
          jurisdictionCode: "310000",
          asOfDate: "2026-09-01",
          ownerUserId: "user-1",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(PolicySnapshotUnavailableError);
    expect(deps.runEngine).not.toHaveBeenCalled();
  });
});
