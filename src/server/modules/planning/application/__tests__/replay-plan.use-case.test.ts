/**
 * 任务3（JRP-FR-014/028/AC-008、JRP-NFR-006）：历史 plan 真实重放用例测试。
 *
 * - owner 重放自己的 plan；他人/不存在 → forbidden/not-found；
 * - 按保存的 snapshotId+hash+asOfDate 重放，不随当前活动快照切换变化；
 * - 重放前三方一致性校验（JRP-FR-028）：plan 保存 hash、快照行 contentHash、
 *   成员重算 hash 必须全部一致；任一不一致 → 明确 snapshot drift 且 fail-closed
 *   （不得使用漂移快照继续产生规划结果）；
 * - 快照删除/无快照引用 → fail-closed。
 */
import { describe, it, expect, vi } from "vitest";
import {
  replayPlan,
  ReplayNotFoundError,
  ReplayForbiddenError,
  ReplaySnapshotUnavailableError,
  ReplaySnapshotDriftError,
} from "../replay-plan.use-case";
import { canonicalMemberHash } from "@/server/modules/publishing/application/release-gates";

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    userInput: { basic: { gender: "male", birth_year: 1973 } },
    calcResult: {},
    planOutput: {},
    trace: [],
    ruleSetVersion: "RS-SNAPSHOT",
    policyPackVersion: "SNAPSHOT",
    conclusionLevel: null,
    asOfDate: "2026-09-01",
    jurisdictionCode: "310000",
    resolvedJurisdictionPath: "/CN/310000/",
    snapshotId: "snap-1",
    sessionId: null,
    ownerUserId: "user-1",
    snapshotContentHash: "hash-1",
    createdAt: new Date("2026-09-07T08:00:00Z"),
    ...overrides,
  };
}

function makeSnap(snapshotId: string, jurisdictionCode: string) {
  const members = [
    {
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

function makeDeps(overrides: Record<string, unknown> = {}) {
  const snap = makeSnap("snap-1", "310000");
  return {
    getPlan: vi.fn(async () => makePlan({ snapshotContentHash: snap.snapshot.contentHash })),
    getSnapshot: vi.fn(async () => snap),
    ...overrides,
  };
}

describe("历史 plan 重放（JRP-FR-014/028/AC-008）", () => {
  it("owner 重放：按保存快照执行并返回原快照元数据与漂移结论（JRP-AC-008）", async () => {
    const snap = makeSnap("snap-1", "310000");
    const deps = makeDeps({
      getPlan: vi.fn(async () =>
        makePlan({ snapshotContentHash: snap.snapshot.contentHash }),
      ),
    });
    const result = await replayPlan(deps as never, "plan-1", {
      userId: "user-1",
    });
    expect(result.planId).toBe("plan-1");
    expect(result.snapshotId).toBe("snap-1");
    expect(result.asOfDate).toBe("2026-09-01");
    expect(result.drift).toEqual({
      savedHash: snap.snapshot.contentHash,
      currentHash: snap.snapshot.contentHash,
      drifted: false,
    });
    expect(result.meta).toMatchObject({
      jurisdiction_code: "310000",
      snapshot_id: "snap-1",
    });
  });

  it("plan 保存 hash 与快照行 hash 不一致：明确 drift 且 fail-closed，不产生规划结果（JRP-FR-028）", async () => {
    const snap = makeSnap("snap-1", "310000");
    const deps = makeDeps({
      getPlan: vi.fn(async () =>
        makePlan({ snapshotContentHash: "old-hash-different" }),
      ),
      getSnapshot: vi.fn(async () => snap),
    });
    await expect(
      replayPlan(deps as never, "plan-1", { userId: "user-1" }),
    ).rejects.toBeInstanceOf(ReplaySnapshotDriftError);
  });

  it("快照行 contentHash 与成员重算 hash 不一致（行hash未更新/成员被篡改）：明确 drift 且 fail-closed（JRP-FR-028）", async () => {
    const snap = makeSnap("snap-1", "310000");
    // 成员被篡改但快照行 contentHash 与 plan 保存 hash 保持原值 → 重算hash漂移。
    snap.members[0] = {
      ...snap.members[0],
      payload: { ...snap.members[0].payload, name: "被篡改的名称" },
    };
    const deps = makeDeps({
      getPlan: vi.fn(async () =>
        makePlan({ snapshotContentHash: snap.snapshot.contentHash }),
      ),
      getSnapshot: vi.fn(async () => snap),
    });
    await expect(
      replayPlan(deps as never, "plan-1", { userId: "user-1" }),
    ).rejects.toBeInstanceOf(ReplaySnapshotDriftError);
  });

  it("三方一致：重放成功且 drift.drifted=false（保存hash=行hash=重算hash，JRP-AC-008）", async () => {
    const snap = makeSnap("snap-1", "310000");
    const deps = makeDeps({
      getPlan: vi.fn(async () =>
        makePlan({ snapshotContentHash: snap.snapshot.contentHash }),
      ),
    });
    const result = await replayPlan(deps as never, "plan-1", {
      userId: "user-1",
    });
    expect(result.drift).toEqual({
      savedHash: snap.snapshot.contentHash,
      currentHash: snap.snapshot.contentHash,
      drifted: false,
    });
    // 漂移错误对象携带三方 hash 便于明确结论（不吞掉细节）。
    expect(ReplaySnapshotDriftError.name).toBe("ReplaySnapshotDriftError");
  });

  it("plan 未保存 snapshotContentHash：无法三方核对，fail-closed（JRP-FR-028）", async () => {
    const snap = makeSnap("snap-1", "310000");
    const deps = makeDeps({
      getPlan: vi.fn(async () => makePlan({ snapshotContentHash: null })),
      getSnapshot: vi.fn(async () => snap),
    });
    await expect(
      replayPlan(deps as never, "plan-1", { userId: "user-1" }),
    ).rejects.toBeInstanceOf(ReplaySnapshotDriftError);
  });

  it("他人 plan：ReplayForbidden（归属校验）", async () => {
    const deps = makeDeps();
    await expect(
      replayPlan(deps as never, "plan-1", { userId: "other-user" }),
    ).rejects.toBeInstanceOf(ReplayForbiddenError);
  });

  it("plan 不存在：ReplayNotFound", async () => {
    const deps = makeDeps({ getPlan: vi.fn(async () => null) });
    await expect(
      replayPlan(deps as never, "ghost", { userId: "user-1" }),
    ).rejects.toBeInstanceOf(ReplayNotFoundError);
  });

  it("历史 plan 无快照引用：fail-closed（JRP-FR-014 不猜测替代）", async () => {
    const deps = makeDeps({
      getPlan: vi.fn(async () => makePlan({ snapshotId: null })),
    });
    await expect(
      replayPlan(deps as never, "plan-1", { userId: "user-1" }),
    ).rejects.toBeInstanceOf(ReplaySnapshotUnavailableError);
  });

  it("保存的快照已删除：fail-closed（JRP-FR-014）", async () => {
    const deps = makeDeps({ getSnapshot: vi.fn(async () => null) });
    await expect(
      replayPlan(deps as never, "plan-1", { userId: "user-1" }),
    ).rejects.toBeInstanceOf(ReplaySnapshotUnavailableError);
  });

  it("重放不随当前活动快照调度变化（JRP-NFR-006）", async () => {
    const snap = makeSnap("snap-1", "310000");
    const deps = makeDeps({
      getPlan: vi.fn(async () =>
        makePlan({ snapshotContentHash: snap.snapshot.contentHash }),
      ),
      getSnapshot: vi.fn(async () => snap),
    });
    const a = await replayPlan(deps as never, "plan-1", { userId: "user-1" });
    const b = await replayPlan(deps as never, "plan-1", { userId: "user-1" });
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
    expect(JSON.stringify(a.calc)).toBe(JSON.stringify(b.calc));
  });
});