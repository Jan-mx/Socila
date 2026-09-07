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

function makeSnap(snapshotId: string, jurisdictionCode: string) {
  return {
    snapshot: {
      id: snapshotId,
      jurisdictionCode,
      asOfDate: "2026-09-01",
      resolvedPath: `/CN/${jurisdictionCode}/`,
      contentHash: "abc123",
      createdBy: "admin",
      createdAt: new Date("2026-09-07T08:00:00Z"),
    },
    members: [
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
          decisionTable: {},
          outputs: [],
          examples: [],
          evidence: [],
        },
        provenance: [],
      },
    ],
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
    expect(deps.getActiveRelease).toHaveBeenCalledWith("510000");
  });

  it("活动发布记录存在但缺少快照：409 POLICY_SNAPSHOT_UNAVAILABLE（JRP-FR-004/AC-011 场景）", async () => {
    const deps = baseDeps({
      getActiveRelease: vi.fn(async () => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: null,
        status: "active",
        gateResults: {},
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
      getActiveRelease: vi.fn(async () => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "missing-snapshot",
        status: "active",
        gateResults: {},
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
      getActiveRelease: vi.fn(async () => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "snap-1",
        status: "active",
        gateResults: {},
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
      getActiveRelease: vi.fn(async () => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "snap-x",
        status: "active",
        gateResults: {},
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
      getActiveRelease: vi.fn(async () => ({
        id: 1,
        jurisdictionCode: "310000",
        activeSnapshotId: "snap-1",
        status: "active",
        gateResults: { reference: "pass" },
        activatedAt: new Date("2026-09-07T08:00:00Z"),
        activatedBy: "admin",
        updatedAt: new Date("2026-09-07T08:00:00Z"),
      })),
      getSnapshot: vi.fn(async () => makeSnap("snap-1", "310000")),
      runEngine,
      savePlan,
    });

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
      getActiveRelease: vi.fn(async () => ({
        id: 2,
        jurisdictionCode: "440000",
        activeSnapshotId: "snap-gd",
        status: "active",
        gateResults: {},
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
    expect(deps.getActiveRelease).toHaveBeenCalledWith("440000");
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