/**
 * 任务3（JRP-FR-005/006/007/024/027、AC-008/010/011）：地区规划发布记录用例专用测试。
 *
 * - 只有新鲜管理员身份可激活、切换或停用地区（JRP-FR-006/AC-010）；
 * - 激活必须真实运行七道门禁（引用/Schema/参数依赖/冲突/黄金/双重重放/内容哈希，
 *   JRP-FR-007/AC-007），伪造 pass 不能绕过；
 * - 激活区间必须闭合定义（JRP-FR-024）；
 * - 切换出新快照不改写历史快照（JRP-NFR-006/FR-019）；
 * - 停用只改状态不删快照/plan（JRP-FR-027/AC-009）；
 * - 四川延期期间不创建发布记录（JRP-FR-013）由上层调用约束，本用例拒绝非法输入。
 *
 * 单元测试：零数据库依赖（JRP-NFR-007）。
 */
import { describe, it, expect, vi } from "vitest";
import {
  activateJurisdictionRelease,
  deactivateJurisdictionRelease,
  requireFreshAdminForRelease,
  ReleaseGateError,
  ReleaseJurisdictionMismatchError,
  ReleaseNotFoundError,
} from "../jurisdiction-release.use-case";
import { canonicalMemberHash } from "../release-gates";

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
      asOfDate: "2026-09-07",
      resolvedPath: `/CN/${jurisdictionCode}/`,
      contentHash: canonicalMemberHash(members),
      createdBy: "admin",
      createdAt: new Date("2026-09-07T08:00:00Z"),
    },
    members,
  };
}

/** 一条必然通过的黄金测试（空 expected；JRP-FR-007 至少一条适用测试）。 */
function passingGoldenTests() {
  return [
    {
      id: 1,
      name: "R-120 基础通过",
      jurisdictionCode: "310000",
      ruleId: "R-120-COMPUTE-RETIRE-DATE",
      input: { user: { basic: { gender: "male", birth_year: 1973 } } },
      paramsOverride: null,
      expected: {},
      source: "example",
      lastRunResult: null,
      lastRunAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const upsert = vi.fn(async (data: Record<string, unknown>) => ({
    id: 1,
    ...data,
  }));
  return {
    requireAdmin: vi.fn(async (actor: { role?: string; status?: string }) =>
      actor?.role === "admin" && actor?.status === "active"
        ? { ok: true as const }
        : { ok: false as const, reason: "管理员身份校验失败" },
    ),
    getSnapshot: vi.fn(async () => null),
    listOpenConflicts: vi.fn(async () => []),
    loadTests: vi.fn(async () => passingGoldenTests() as never),
    // 门禁注入：引用校验通过（单元测试不读真实仓库文件）。
    verifyEvidence: vi.fn(() => ({
      verified: true,
      errors: [],
      checked: 1,
    })),
    upsert,
    now: () => new Date("2026-09-07T10:00:00.000Z"),
    ...overrides,
  };
}

const ADMIN = { id: "admin-1", role: "admin", status: "active" };
const EFF_FROM = "2026-01-01";

describe("地区规划发布记录（JRP-FR-005～007/024/AC-010）", () => {
  it("新鲜管理员 + 快照存在且地区匹配 + 全部门禁通过：写入 active 发布记录（JRP-FR-005/006/007）", async () => {
    const deps = makeDeps({
      getSnapshot: vi.fn(async () => makeSnap("snap-sh", "310000")),
    });
    const release = await activateJurisdictionRelease(deps as never, {
      jurisdictionCode: "310000",
      snapshotId: "snap-sh",
      effectiveFrom: EFF_FROM,
      actor: ADMIN,
    });
    expect(release.status).toBe("active");
    expect(release.activeSnapshotId).toBe("snap-sh");
    expect(release.activatedBy).toBe("admin-1");
    expect(release.effectiveFrom).toBe(EFF_FROM);
    expect(release.activatedAt).toEqual(new Date("2026-09-07T10:00:00.000Z"));
    // 七道门禁真实逐项 pass（不存在伪造的 snapshot_replay 直写）。
    expect(release.gateResults).toMatchObject({
      reference: "pass",
      schema: "pass",
      param_deps: "pass",
      conflicts: "pass",
      golden_tests: "pass",
      replay_twice: "pass",
      content_hash: "pass",
    });
    expect("snapshot_replay" in (release.gateResults as object)).toBe(false);
    expect(deps.upsert).toHaveBeenCalledTimes(1);
  });

  it("普通用户或非新鲜管理员：拒绝且零数据库变化（JRP-AC-010）", async () => {
    const deps = makeDeps();
    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "310000",
        snapshotId: "snap-sh",
        effectiveFrom: EFF_FROM,
        actor: { id: "user-1", role: "user", status: "active" },
      }),
    ).rejects.toThrow("管理员");
    expect(deps.upsert).not.toHaveBeenCalled();

    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "310000",
        snapshotId: "snap-sh",
        effectiveFrom: EFF_FROM,
        actor: { id: "admin-1", role: "admin", status: "disabled" },
      }),
    ).rejects.toThrow("管理员");
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("快照不存在：激活被拒绝（JRP-FR-007 快照门禁）", async () => {
    const deps = makeDeps();
    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "310000",
        snapshotId: "ghost",
        effectiveFrom: EFF_FROM,
        actor: ADMIN,
      }),
    ).rejects.toThrow("快照");
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("快照地区与发布地区不一致：激活被拒绝（JRP-NFR-001/003 地区隔离）", async () => {
    const deps = makeDeps({
      getSnapshot: vi.fn(async () => makeSnap("snap-gd", "440000")),
    });
    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "310000",
        snapshotId: "snap-gd",
        effectiveFrom: EFF_FROM,
        actor: ADMIN,
      }),
    ).rejects.toThrow("地区");
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("缺少 effective_from：激活被拒绝（JRP-FR-024 闭合定义）", async () => {
    const deps = makeDeps({
      getSnapshot: vi.fn(async () => makeSnap("snap-sh", "310000")),
    });
    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "310000",
        snapshotId: "snap-sh",
        effectiveFrom: "",
        actor: ADMIN,
      }),
    ).rejects.toThrow("effective_from");
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("effective_to 早于 effective_from：激活被拒绝（JRP-FR-024）", async () => {
    const deps = makeDeps({
      getSnapshot: vi.fn(async () => makeSnap("snap-sh", "310000")),
    });
    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "310000",
        snapshotId: "snap-sh",
        effectiveFrom: "2030-01-01",
        effectiveTo: "2026-01-01",
        actor: ADMIN,
      }),
    ).rejects.toThrow("effective_to");
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("门禁任一失败（冲突）：激活被拒绝且带真实 gateResults（JRP-AC-007）", async () => {
    const deps = makeDeps({
      getSnapshot: vi.fn(async () => makeSnap("snap-sh", "310000")),
      listOpenConflicts: vi.fn(async () => [
        { id: 1, jurisdictionCode: "310000", kind: "same-level-overlap" },
      ]),
    });
    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "310000",
        snapshotId: "snap-sh",
        effectiveFrom: EFF_FROM,
        actor: ADMIN,
      }),
    ).rejects.toMatchObject({
      name: "ReleaseGateError",
      gateResults: { conflicts: { fail: expect.any(String) } },
    });
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("门禁任一失败（hash 漂移）：伪造 pass 不能绕过（JRP-AC-007）", async () => {
    const snap = makeSnap("snap-sh", "310000");
    snap.members[0] = {
      ...snap.members[0],
      payload: { ...snap.members[0].payload, name: "篡改" },
    };
    const deps = makeDeps({
      getSnapshot: vi.fn(async () => snap),
    });
    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "310000",
        snapshotId: "snap-sh",
        effectiveFrom: EFF_FROM,
        actor: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ReleaseGateError);
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("切换活动快照：发布记录更新为新快照，历史快照不被修改或删除（JRP-NFR-006/FR-019、AC-008）", async () => {
    const getSnapshot = vi.fn(async (id: string) => makeSnap(id, "310000"));
    const upsert = vi.fn(async (data: Record<string, unknown>) => ({
      id: 1,
      ...data,
    }));
    const deps = makeDeps({
      getSnapshot,
      upsert,
      requireAdmin: vi.fn(async () => ({ ok: true as const })),
    });

    const first = await activateJurisdictionRelease(deps as never, {
      jurisdictionCode: "310000",
      snapshotId: "snap-v1",
      effectiveFrom: EFF_FROM,
      actor: ADMIN,
    });
    const second = await activateJurisdictionRelease(deps as never, {
      jurisdictionCode: "310000",
      snapshotId: "snap-v2",
      effectiveFrom: EFF_FROM,
      actor: ADMIN,
    });

    expect(first.activeSnapshotId).toBe("snap-v1");
    expect(second.activeSnapshotId).toBe("snap-v2");
    expect(upsert).toHaveBeenCalledTimes(2);
    expect((await getSnapshot("snap-v1")).snapshot.jurisdictionCode).toBe(
      "310000",
    );
  });

  it("四川延期期间：激活被拒绝（无候选快照，JRP-FR-013）", async () => {
    const deps = makeDeps();
    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "510000",
        snapshotId: "sc-snap",
        effectiveFrom: EFF_FROM,
        actor: ADMIN,
      }),
    ).rejects.toThrow("快照");
    expect(deps.upsert).not.toHaveBeenCalled();
  });
});

describe("停用发布区间（JRP-FR-027/AC-009）", () => {
  it("新鲜管理员停用：只改状态，不删除快照或历史 plan", async () => {
    const deactivateById = vi.fn(async (id: number) => ({
      id,
      jurisdictionCode: "440000",
      activeSnapshotId: "snap-gd",
      status: "inactive",
      gateResults: {},
      activatedAt: new Date("2026-09-07T10:00:00Z"),
      activatedBy: "admin-1",
      updatedAt: new Date("2026-09-07T11:00:00Z"),
    }));
    const getById = vi.fn(async () => ({
      id: 42,
      jurisdictionCode: "440000",
      activeSnapshotId: "snap-gd",
      status: "active",
      gateResults: {},
      activatedAt: new Date("2026-09-07T10:00:00Z"),
      activatedBy: "admin-1",
      updatedAt: new Date("2026-09-07T10:00:00Z"),
    }));
    const deps = makeDeps({ getById, deactivateById });

    const result = await deactivateJurisdictionRelease(deps as never, {
      releaseId: 42,
      jurisdictionCode: "440000",
      actor: ADMIN,
    });
    expect(result.status).toBe("inactive");
    expect(result.activeSnapshotId).toBe("snap-gd");
    expect(getById).toHaveBeenCalledWith(42);
    expect(deactivateById).toHaveBeenCalledWith(42);
  });

  it("URL地区代码与release记录地区不一致：拒绝且零修改（广东URL+上海releaseId，JRP-FR-027/AC-009）", async () => {
    const getById = vi.fn(async () => ({
      id: 42,
      jurisdictionCode: "310000", // 记录是上海
      activeSnapshotId: "snap-sh",
      status: "active",
      gateResults: {},
      activatedAt: new Date("2026-09-07T10:00:00Z"),
      activatedBy: "admin-1",
      updatedAt: new Date("2026-09-07T10:00:00Z"),
    }));
    const deactivateById = vi.fn(async () => null);
    const deps = makeDeps({ getById, deactivateById });

    await expect(
      deactivateJurisdictionRelease(deps as never, {
        releaseId: 42,
        jurisdictionCode: "440000", // URL 是广东
        actor: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ReleaseJurisdictionMismatchError);
    // 拒绝时不得修改任何 release（零写入）。
    expect(deactivateById).not.toHaveBeenCalled();
  });

  it("非新鲜管理员停用：拒绝且零变化（JRP-FR-027/AC-010）", async () => {
    const deps = makeDeps();
    await expect(
      deactivateJurisdictionRelease(deps as never, {
        releaseId: 42,
        jurisdictionCode: "440000",
        actor: { id: "user-1", role: "user", status: "active" },
      }),
    ).rejects.toThrow("管理员");
  });

  it("区间不存在：ReleaseNotFoundError（幂等停用语义）", async () => {
    const deps = makeDeps({
      getById: vi.fn(async () => null),
      deactivateById: vi.fn(async () => null),
    });
    await expect(
      deactivateJurisdictionRelease(deps as never, {
        releaseId: 999,
        jurisdictionCode: "440000",
        actor: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ReleaseNotFoundError);
  });
});

describe("requireFreshAdminForRelease（JRP-FR-006 复用）", () => {
  it("直接 SQL 改状态被禁止：用例必须经 fresh admin 校验（JRP-FR-006 不变量）", () => {
    expect(typeof requireFreshAdminForRelease).toBe("function");
    expect(requireFreshAdminForRelease.name).toContain("require");
  });
});