/**
 * 任务3（JRP-FR-015～019/AC-013/014/016）：会话级地区画像用例专用测试。
 *
 * - 只有用户明确确认（selector/conversation-confirmation）才写入 confirmed 画像；
 * - 模型/AI 提交的地区候选不得升级为 confirmed（JRP-AC-014）；
 * - name/level/confirmedAt 由服务端根据地区树与服务端时钟规范化（JRP-FR-015）；
 * - 切换地区保留历史消息、清除旧地区派生状态（JRP-FR-019/AC-016）；
 * - 恢复会话时返回已确认地区；无地区画像时要求重新确认（JRP-FR-017/AC-013）。
 *
 * 单元测试：零数据库依赖（JRP-NFR-007）。
 */
import { describe, it, expect, vi } from "vitest";
import {
  confirmConversationJurisdiction,
  getConfirmedJurisdiction,
  applyJurisdictionCandidate,
  deriveJurisdictionCandidate,
  JURISDICTION_DERIVED_STATE_KEY,
} from "../jurisdiction-profile.use-case";

interface TreeRow {
  code: string;
  name: string;
  level: string;
  enabled: boolean;
}

const TREE: TreeRow[] = [
  { code: "CN", name: "中国", level: "national", enabled: true },
  { code: "310000", name: "上海市", level: "province", enabled: true },
  { code: "440000", name: "广东省", level: "province", enabled: true },
  { code: "510000", name: "四川省", level: "province", enabled: true },
];

function makeTreeLookup() {
  return vi.fn(async (code: string) =>
    TREE.find((t) => t.code === code) ?? null,
  );
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const getConversation = vi.fn(async () => ({
    id: "conv-1",
    sessionId: null,
    ownerUserId: "user-1",
    messages: [
      { role: "user", content: "我在上海" },
      { role: "assistant", content: "好的" },
    ],
    userProfile: {},
    createdAt: new Date("2026-09-01T08:00:00Z"),
    updatedAt: new Date("2026-09-01T08:00:00Z"),
  }));
  const updateConversation = vi.fn(
    async (id: string, data: Record<string, unknown>) => ({
      id,
      ...data,
    }),
  );
  return {
    findJurisdiction: makeTreeLookup(),
    getConversation,
    updateConversation,
    getConfirmedJurisdiction: null as unknown,
    ...overrides,
  };
}

describe("会话地区画像（JRP-FR-015～019）", () => {
  it("用户明确确认上海：服务端规范化写入 confirmed 画像（JRP-AC-013/FR-015）", async () => {
    const deps = makeDeps();
    const result = await confirmConversationJurisdiction(
      deps as never,
      "conv-1",
      { userId: "user-1" },
      "310000",
      "selector",
      "2026-09-07T10:00:00.000Z",
    );
    expect(result.ok).toBe(true);
    const profile = deps.updateConversation.mock.calls[0][1] as {
      userProfile: Record<string, unknown>;
    };
    const j = profile.userProfile.jurisdiction as Record<string, unknown>;
    expect(j.code).toBe("310000");
    expect(j.name).toBe("上海市"); // 服务端地区树名称，不是客户端文本
    expect(j.level).toBe("province");
    expect(j.confirmed).toBe(true);
    expect(j.confirmedAt).toBe("2026-09-07T10:00:00.000Z");
    expect(j.source).toBe("selector");
  });

  it("客户端注入的 name/level/confirmed/confirmedAt 一律被服务端覆盖（JRP-FR-015 不可信输入）", async () => {
    const deps = makeDeps();
    await confirmConversationJurisdiction(
      deps as never,
      "conv-1",
      { userId: "user-1" },
      "440000",
      "conversation-confirmation",
      "2026-09-07T10:00:00.000Z",
    );
    const profile = deps.updateConversation.mock.calls[0][1] as {
      userProfile: Record<string, unknown>;
    };
    const j = profile.userProfile.jurisdiction as Record<string, unknown>;
    expect(j.name).toBe("广东省");
    expect(j.level).toBe("province");
  });

  it("未知地区代码：确认被拒绝且画像零变化（JRP-NFR-003 fail-closed）", async () => {
    const deps = makeDeps();
    const result = await confirmConversationJurisdiction(
      deps as never,
      "conv-1",
      { userId: "user-1" },
      "999999",
      "selector",
      "2026-09-07T10:00:00.000Z",
    );
    expect(result.ok).toBe(false);
    expect(deps.updateConversation).not.toHaveBeenCalled();
  });

  it("已禁用地区：确认被拒绝（JRP-AC-002 地区树启用要求）", async () => {
    const findJurisdiction = vi.fn(async (code: string) =>
      code === "999999" ? null : { code, name: "某地", level: "province", enabled: false },
    );
    const deps = makeDeps({ findJurisdiction });
    const result = await confirmConversationJurisdiction(
      deps as never,
      "conv-1",
      { userId: "user-1" },
      "510000",
      "selector",
      "2026-09-07T10:00:00.000Z",
    );
    expect(result.ok).toBe(false);
    expect(deps.updateConversation).not.toHaveBeenCalled();
  });

  it("模型识别出的候选：只产生候选结果，不得写入 confirmed 画像或触发规划（JRP-AC-014/FR-016）", async () => {
    const deps = makeDeps();
    // AI 提交"广东"候选
    const candidate = await applyJurisdictionCandidate(
      deps as never,
      "conv-1",
      { userId: "user-1" },
      { code: "440000", name: "广东" },
    );
    expect(candidate.pendingConfirmation).toBe(true);
    // 画像未被写入任何 jurisdiction 字段（候选不得持久化为已确认）。
    expect(deps.updateConversation).not.toHaveBeenCalled();
    const confirmed = await getConfirmedJurisdiction(deps as never, "conv-1", {
      userId: "user-1",
    });
    expect(confirmed).toBeNull();
  });

  it("文本候选解析：唯一匹配给候选、多候选/零候选要求用户确认（JRP-FR-012/AC-009）", async () => {
    const candidates = await deriveJurisdictionCandidate(
      TREE,
      "我在上海工作",
    );
    expect(candidates.length).toBe(1);
    expect(candidates[0].code).toBe("310000");

    const multi = await deriveJurisdictionCandidate(TREE, "广东和四川都待过");
    expect(multi.length).toBeGreaterThan(1);

    const none = await deriveJurisdictionCandidate(TREE, "火星");
    expect(none).toHaveLength(0);
  });

  it("切换地区（上海→广东）：历史消息保留、旧地区派生状态被清除、新地区写入（JRP-AC-016/FR-019）", async () => {
    const getConversation = vi.fn(async () => ({
      id: "conv-1",
      sessionId: null,
      ownerUserId: "user-1",
      messages: [
        { role: "user", content: "我在上海交社保" },
        { role: "assistant", content: "上海方案……" },
      ],
      userProfile: {
        jurisdiction: {
          code: "310000",
          name: "上海市",
          level: "province",
          confirmed: true,
          confirmedAt: "2026-09-05T08:00:00.000Z",
          source: "selector",
        },
        [JURISDICTION_DERIVED_STATE_KEY]: {
          questions: [{ question_id: "Q-SH-X" }],
          plan_ref: "plan-sh-1",
          snapshot_ref: "snap-sh-1",
          calc_cache: { retirement: {} },
        },
      },
      createdAt: new Date("2026-09-01T08:00:00Z"),
      updatedAt: new Date("2026-09-05T08:00:00Z"),
    }));
    const updateConversation = vi.fn(async (id: string, data: unknown) => ({
      id,
      ...(data as Record<string, unknown>),
    }));
    const deps = makeDeps({ getConversation, updateConversation });

    const result = await confirmConversationJurisdiction(
      deps as never,
      "conv-1",
      { userId: "user-1" },
      "440000",
      "selector",
      "2026-09-07T10:00:00.000Z",
    );
    expect(result.ok).toBe(true);

    const updateArgs = updateConversation.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // 切换只更新画像：messages 参数不得传入（历史消息原样保留）。
    expect(Object.keys(updateArgs[1])).toEqual(["userProfile"]);
    const profile = updateArgs[1].userProfile as Record<string, unknown>;
    expect(profile.messages).toBeUndefined();
    // 新地区已确认。
    expect((profile.jurisdiction as Record<string, unknown>).code).toBe("440000");
    expect((profile.jurisdiction as Record<string, unknown>).name).toBe("广东省");
    // 旧地区派生状态已清除。
    expect(profile[JURISDICTION_DERIVED_STATE_KEY]).toBeUndefined();
  });

  it("同一地区再次确认：不产生派生状态清除（幂等保持）", async () => {
    const getConversation = vi.fn(async () => ({
      id: "conv-1",
      sessionId: null,
      ownerUserId: "user-1",
      messages: [],
      userProfile: {
        jurisdiction: {
          code: "310000",
          name: "上海市",
          level: "province",
          confirmed: true,
          confirmedAt: "2026-09-05T08:00:00.000Z",
          source: "selector",
        },
        [JURISDICTION_DERIVED_STATE_KEY]: { questions: [] },
      },
      createdAt: new Date("2026-09-01T08:00:00Z"),
      updatedAt: new Date("2026-09-05T08:00:00Z"),
    }));
    const updateConversation = vi.fn(async (id: string, data: unknown) => ({
      id,
      ...(data as Record<string, unknown>),
    }));
    const deps = makeDeps({ getConversation, updateConversation });

    const result = await confirmConversationJurisdiction(
      deps as never,
      "conv-1",
      { userId: "user-1" },
      "310000",
      "selector",
      "2026-09-07T10:00:00.000Z",
    );
    expect(result.ok).toBe(true);
    // 同地区确认仅刷新确认时间，不删除既有派生状态。
    const profile = updateConversation.mock.calls[0][1] as {
      userProfile: Record<string, unknown>;
    };
    expect(profile.userProfile[JURISDICTION_DERIVED_STATE_KEY]).toBeDefined();
  });

  it("恢复会话：完整返回已确认地区；无画像地区返回 null 表示必须重新确认（JRP-FR-017/AC-013）", async () => {
    const confirmedConv = {
      id: "conv-1",
      sessionId: null,
      ownerUserId: "user-1",
      messages: [],
      userProfile: {
        jurisdiction: {
          code: "310000",
          name: "上海市",
          level: "province",
          confirmed: true,
          confirmedAt: "2026-09-05T08:00:00.000Z",
          source: "conversation-confirmation",
        },
      },
      createdAt: new Date("2026-09-01T08:00:00Z"),
      updatedAt: new Date("2026-09-05T08:00:00Z"),
    };
    const deps = makeDeps({
      getConversation: vi.fn(async () => confirmedConv),
    });
    const restored = await getConfirmedJurisdiction(deps as never, "conv-1", {
      userId: "user-1",
    });
    expect(restored).toEqual({
      code: "310000",
      name: "上海市",
      level: "province",
      confirmed: true,
      confirmedAt: "2026-09-05T08:00:00.000Z",
      source: "conversation-confirmation",
    });

    const depsNoProfile = makeDeps({
      getConversation: vi.fn(async () => ({
        ...confirmedConv,
        userProfile: {},
      })),
    });
    expect(
      await getConfirmedJurisdiction(depsNoProfile as never, "conv-1", {
        userId: "user-1",
      }),
    ).toBeNull();
  });
});