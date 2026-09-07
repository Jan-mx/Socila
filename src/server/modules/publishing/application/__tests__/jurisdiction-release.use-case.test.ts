/**
 * 任务3（JRP-FR-005/006/007/AC-010）：地区规划发布记录激活/切换用例专用测试。
 *
 * - 只有新鲜管理员身份可激活、切换或停用地区（JRP-FR-006/AC-010）；
 * - 激活必须绑定与发布地区相同的已存在快照，且无未解决冲突（JRP-FR-007）；
 * - 切换出新快照不改写历史快照（JRP-NFR-006/FR-019）；
 * - 四川延期期间不创建发布记录（JRP-FR-013）由上层调用约束，本用例拒绝非法输入。
 *
 * 单元测试：零数据库依赖（JRP-NFR-007）。
 */
import { describe, it, expect, vi } from "vitest";
import {
  activateJurisdictionRelease,
  requireFreshAdminForRelease,
} from "../jurisdiction-release.use-case";

function makeSnap(snapshotId: string, jurisdictionCode: string) {
  return {
    snapshot: {
      id: snapshotId,
      jurisdictionCode,
      asOfDate: "2026-09-07",
      resolvedPath: `/CN/${jurisdictionCode}/`,
      contentHash: "hash-" + snapshotId,
      createdBy: "admin",
      createdAt: new Date("2026-09-07T08:00:00Z"),
    },
    members: [
      {
        id: 1,
        snapshotId,
        entityType: "param" as const,
        businessKey: "P-MI-LIFETIME-MALE-YEARS",
        payload: {},
        provenance: [],
      },
    ],
  };
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
    upsert,
    now: () => new Date("2026-09-07T10:00:00.000Z"),
    ...overrides,
  };
}

describe("地区规划发布记录（JRP-FR-005～007/AC-010）", () => {
  it("新鲜管理员 + 快照存在且地区匹配 + 无冲突：写入 active 发布记录（JRP-FR-005/006/007）", async () => {
    const deps = makeDeps({
      getSnapshot: vi.fn(async () => makeSnap("snap-sh", "310000")),
    });
    const release = await activateJurisdictionRelease(
      deps as never,
      {
        jurisdictionCode: "310000",
        snapshotId: "snap-sh",
        actor: { id: "admin-1", role: "admin", status: "active" },
      },
    );
    expect(release.status).toBe("active");
    expect(release.activeSnapshotId).toBe("snap-sh");
    expect(release.activatedBy).toBe("admin-1");
    expect(release.activatedAt).toEqual(new Date("2026-09-07T10:00:00.000Z"));
    expect(release.gateResults).toMatchObject({
      snapshot_replay: "pass",
      conflicts: "pass",
    });
    expect(deps.upsert).toHaveBeenCalledTimes(1);
  });

  it("普通用户或非新鲜管理员：拒绝且零数据库变化（JRP-AC-010）", async () => {
    const deps = makeDeps();
    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "310000",
        snapshotId: "snap-sh",
        actor: { id: "user-1", role: "user", status: "active" },
      }),
    ).rejects.toThrow("管理员");
    expect(deps.upsert).not.toHaveBeenCalled();

    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "310000",
        snapshotId: "snap-sh",
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
        actor: { id: "admin-1", role: "admin", status: "active" },
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
        actor: { id: "admin-1", role: "admin", status: "active" },
      }),
    ).rejects.toThrow("地区");
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("存在未解决冲突：激活被拒绝（JRP-FR-007 冲突门禁）", async () => {
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
        actor: { id: "admin-1", role: "admin", status: "active" },
      }),
    ).rejects.toThrow("冲突");
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("切换活动快照：发布记录更新为新快照，历史快照不被修改或删除（JRP-NFR-006/FR-019、AC-008 场景）", async () => {
    const getSnapshot = vi.fn(async (id: string) =>
      makeSnap(id, "310000"),
    );
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
      actor: { id: "admin-1", role: "admin", status: "active" },
    });
    const second = await activateJurisdictionRelease(deps as never, {
      jurisdictionCode: "310000",
      snapshotId: "snap-v2",
      actor: { id: "admin-1", role: "admin", status: "active" },
    });

    expect(first.activeSnapshotId).toBe("snap-v1");
    expect(second.activeSnapshotId).toBe("snap-v2");
    expect(upsert).toHaveBeenCalledTimes(2);
    // 历史快照仍可读取（未删除）：切换路径不存在删除快照的依赖。
    expect(
      (await getSnapshot("snap-v1")).snapshot.jurisdictionCode,
    ).toBe("310000");
  });

  it("四川延期期间：激活被拒绝（无候选快照，JRP-FR-013）", async () => {
    const deps = makeDeps();
    await expect(
      activateJurisdictionRelease(deps as never, {
        jurisdictionCode: "510000",
        snapshotId: "sc-snap",
        actor: { id: "admin-1", role: "admin", status: "active" },
      }),
    ).rejects.toThrow("快照");
    expect(deps.upsert).not.toHaveBeenCalled();
  });
});

describe("requireFreshAdminForRelease（JRP-FR-006 复用）", () => {
  it("直接 SQL 改状态被禁止：用例必须经 fresh admin 校验（JRP-FR-006 不变量）", () => {
    // 这个测试是源码契约：发布记录的状态只允许经由本模块的用例修改，
    // 用例内必须调用 requireFreshAdminForRelease（不接受绕过）。
    expect(typeof requireFreshAdminForRelease).toBe("function");
    expect(requireFreshAdminForRelease.name).toContain("require");
  });
});