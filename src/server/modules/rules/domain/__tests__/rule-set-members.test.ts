/**
 * APR-FR-004/005/007 + APR-NFR-001：规则集成员解析（纯函数）。
 *
 * 复用 mergePolicyContext 的地区继承/有效期/overlay语义（NRP-FR-007），
 * 成员显示顺序必须与持久化 rule_id[] 完全一致；无法解析标记 missing；
 * 不串区、不猜测。
 */
import { describe, expect, it } from "vitest";
import {
  resolveRuleSetMembers,
  type MemberRuleCandidate,
} from "../rule-set-members";

function candidate(over: Partial<MemberRuleCandidate> & { ruleId: string }): MemberRuleCandidate {
  return {
    jurisdictionCode: "CN",
    policyPackId: "CN-BASELINE",
    version: 1,
    name: `规则${over.ruleId}`,
    status: "published",
    operation: "baseline",
    targetBusinessKey: null,
    effectiveFrom: "2020-01-01",
    effectiveTo: null,
    ...over,
  };
}

const CN_SH = ["CN", "310000"];

describe("resolveRuleSetMembers 顺序保持（APR-FR-005/AC-004）", () => {
  it("成员顺序与持久化rule_id[]完全一致，与名称/优先级无关", () => {
    const ruleIds = ["R-900", "R-010", "R-500"];
    const members = resolveRuleSetMembers(
      ruleIds,
      [
        candidate({ ruleId: "R-010", name: "按字母应排前" }),
        candidate({ ruleId: "R-500", jurisdictionCode: "310000", operation: "add", policyPackId: "SHANGHAI_BASE", name: "中文A开头" }),
        candidate({ ruleId: "R-900", name: "最终门禁" }),
      ],
      CN_SH,
      "2026-09-16",
    );
    expect(members.map((m) => m.ruleId)).toEqual(ruleIds);
    expect(members.map((m) => m.position)).toEqual([0, 1, 2]);
  });

  it("名称异步到达与否不影响数组：输出顺序只由输入数组决定", () => {
    const ruleIds = ["R-200", "R-100", "R-300"];
    const all = ruleIds.map((id) => candidate({ ruleId: id }));
    const first = resolveRuleSetMembers(ruleIds, all, CN_SH, "2026-09-16");
    const shuffled = [...all].reverse();
    const second = resolveRuleSetMembers(ruleIds, shuffled, CN_SH, "2026-09-16");
    expect(second).toEqual(first);
  });

  it("确定性：相同身份/链/日期两次解析结果逐字段一致（APR-NFR-001）", () => {
    const inputs = () => resolveRuleSetMembers(
      ["R-010", "R-500"],
      [
        candidate({ ruleId: "R-010" }),
        candidate({ ruleId: "R-500", jurisdictionCode: "310000", operation: "add", policyPackId: "SHANGHAI_BASE" }),
      ],
      CN_SH,
      "2026-09-16",
    );
    expect(inputs()).toEqual(inputs());
  });
});

describe("resolveRuleSetMembers 地区继承与overlay（APR-FR-007/AC-005）", () => {
  it("国家baseline继承：链内仅CN存在时来源地区为CN", () => {
    const [m] = resolveRuleSetMembers(["R-010"], [candidate({ ruleId: "R-010", name: "出生年份解析" })], CN_SH, "2026-09-16");
    expect(m.missing).toBe(false);
    expect(m.jurisdictionCode).toBe("CN");
    expect(m.version).toBe(1);
    expect(m.status).toBe("published");
    expect(m.name).toBe("出生年份解析");
    expect(m.operation).toBe("baseline");
  });

  it("地区add：来源地区为该地区", () => {
    const [m] = resolveRuleSetMembers(
      ["R-500"],
      [candidate({ ruleId: "R-500", jurisdictionCode: "310000", operation: "add", policyPackId: "SHANGHAI_BASE", name: "4050补贴资格" })],
      CN_SH,
      "2026-09-16",
    );
    expect(m.jurisdictionCode).toBe("310000");
    expect(m.operation).toBe("add");
  });

  it("地区replace：中文名称/版本来自替换行，来源地区为替换地区", () => {
    const members = resolveRuleSetMembers(
      ["R-010"],
      [
        candidate({ ruleId: "R-010", name: "国家原名", version: 3 }),
        candidate({ ruleId: "R-010", jurisdictionCode: "310000", policyPackId: "SHANGHAI_BASE", operation: "replace", targetBusinessKey: "R-010", name: "上海替换名", version: 2 }),
      ],
      CN_SH,
      "2026-09-16",
    );
    expect(members[0].name).toBe("上海替换名");
    expect(members[0].jurisdictionCode).toBe("310000");
    expect(members[0].version).toBe(2);
    expect(members[0].operation).toBe("replace");
  });

  it("restrict叠加：内容仍来自上级，operation显示restrict", () => {
    const [m] = resolveRuleSetMembers(
      ["R-220"],
      [
        candidate({ ruleId: "R-220", name: "医保退休年限" }),
        candidate({ ruleId: "R-GD-RESTRICT", jurisdictionCode: "440000", policyPackId: "GD-BASE", operation: "restrict", targetBusinessKey: "R-220", name: "广东附加条件" }),
      ],
      ["CN", "440000"],
      "2026-09-16",
    );
    expect(m.missing).toBe(false);
    expect(m.name).toBe("医保退休年限");
    expect(m.jurisdictionCode).toBe("CN");
    expect(m.operation).toBe("restrict");
  });

  it("exempt成员可见且不被标记missing（APR-FR-007）", () => {
    const [m] = resolveRuleSetMembers(
      ["R-010"],
      [
        candidate({ ruleId: "R-010", name: "被豁免规则" }),
        candidate({ ruleId: "R-EX-010", jurisdictionCode: "310000", policyPackId: "SHANGHAI_BASE", operation: "exempt", targetBusinessKey: "R-010", name: "豁免行" }),
      ],
      CN_SH,
      "2026-09-16",
    );
    expect(m.missing).toBe(false);
    expect(m.operation).toBe("exempt");
    expect(m.name).toBe("被豁免规则");
  });

  it("同编号跨地区不串区：广东规则不会解析进上海链", () => {
    const [m] = resolveRuleSetMembers(
      ["R-SAME"],
      [candidate({ ruleId: "R-SAME", jurisdictionCode: "440000", policyPackId: "GD-BASE", operation: "add", name: "广东规则" })],
      CN_SH,
      "2026-09-16",
    );
    expect(m.missing).toBe(true);
    expect(m.name).toBeNull();
    expect(m.jurisdictionCode).toBeNull();
  });

  it("多版本同包：保留最新生效版本", () => {
    const [m] = resolveRuleSetMembers(
      ["R-010"],
      [
        candidate({ ruleId: "R-010", version: 1, name: "旧版", effectiveFrom: "2020-01-01" }),
        candidate({ ruleId: "R-010", version: 2, name: "新版", effectiveFrom: "2024-01-01" }),
      ],
      CN_SH,
      "2026-09-16",
    );
    expect(m.name).toBe("新版");
    expect(m.version).toBe(2);
  });
});

describe("resolveRuleSetMembers 有效期与缺失（APR-FR-007/AC-006）", () => {
  it("as_of_date决定版本窗口", () => {
    const rows = [
      candidate({ ruleId: "R-W", version: 1, name: "窗口一", effectiveFrom: "2020-01-01", effectiveTo: "2025-12-31" }),
      candidate({ ruleId: "R-W", version: 2, name: "窗口二", effectiveFrom: "2026-01-01", effectiveTo: null }),
    ];
    const old = resolveRuleSetMembers(["R-W"], rows, CN_SH, "2024-06-01");
    expect(old[0].name).toBe("窗口一");
    const fresh = resolveRuleSetMembers(["R-W"], rows, CN_SH, "2026-06-01");
    expect(fresh[0].name).toBe("窗口二");
  });

  it("编号不存在：保留原位置、missing=true、其余字段为null", () => {
    const members = resolveRuleSetMembers(
      ["R-010", "R-NOPE", "R-500"],
      [
        candidate({ ruleId: "R-010" }),
        candidate({ ruleId: "R-500", jurisdictionCode: "310000", operation: "add", policyPackId: "SHANGHAI_BASE" }),
      ],
      CN_SH,
      "2026-09-16",
    );
    expect(members).toHaveLength(3);
    expect(members[1]).toEqual({
      position: 1,
      ruleId: "R-NOPE",
      name: null,
      jurisdictionCode: null,
      version: null,
      status: null,
      operation: null,
      missing: true,
    });
  });

  it("非published状态候选不参与解析（装载方过滤后仍缺失则missing）", () => {
    const members = resolveRuleSetMembers(["R-DRAFT"], [], CN_SH, "2026-09-16");
    expect(members[0].missing).toBe(true);
  });

  it("overlay冲突（同键duplicate-add）fail-closed标记missing，不猜测", () => {
    const [m] = resolveRuleSetMembers(
      ["R-DUP"],
      [
        candidate({ ruleId: "R-DUP", name: "国家键" }),
        candidate({ ruleId: "R-DUP", jurisdictionCode: "310000", policyPackId: "SHANGHAI_BASE", operation: "add", targetBusinessKey: null, name: "上海重复add" }),
      ],
      CN_SH,
      "2026-09-16",
    );
    expect(m.missing).toBe(true);
  });
});

describe("resolveRuleSetMembers 名称缺失回退（APR-FR-004）", () => {
  it("规则name为空字符串时返回null（页面显示编号并标记名称不可用）", () => {
    const [m] = resolveRuleSetMembers(
      ["R-010"],
      [candidate({ ruleId: "R-010", name: "" })],
      CN_SH,
      "2026-09-16",
    );
    expect(m.missing).toBe(false);
    expect(m.name).toBeNull();
  });
});
