/**
 * 任务3（JRP-FR-014/028/AC-008、JRP-NFR-006）：历史 plan 真实重放用例测试。
 *
 * - owner 重放自己的 plan；他人/不存在 → forbidden/not-found；
 * - 按保存的 snapshotId+hash+asOfDate 重放，不随当前活动快照切换变化；
 * - 快照 hash 漂移时返回 drifted 结论（JRP-FR-028）；
 * - 快照删除/无快照引用 → fail-closed。
 */
import { describe, it, expect, vi } from "vitest";
import {
  replayPlan,
  ReplayNotFoundError,
  ReplayForbiddenError,
  ReplaySnapshotUnavailableError,
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

  it("plan 保存 hash 与当前快照 hash 不一致：drifted=true 但仍按保存快照重放（JRP-FR-028）", async () => {
    const snap = makeSnap("snap-1", "310000");
    const deps = makeDeps({
      getPlan: vi.fn(async () =>
        makePlan({ snapshotContentHash: "old-hash-different" }),
      ),
      getSnapshot: vi.fn(async () => snap),
    });
    const result = await replayPlan(deps as never, "plan-1", {
      userId: "user-1",
    });
    expect(result.drift.drifted).toBe(true);
    expect(result.drift.savedHash).toBe("old-hash-different");
    expect(result.drift.currentHash).toBe(snap.snapshot.contentHash);
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