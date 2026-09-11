/**
 * SHV2 §10.2：案例展示的地区与能力中文标签（浏览器安全、无Node依赖）。
 * 生成器（case-content-v2）与公开/管理页面共用同一映射，保证category与能力一致。
 */

export const REGION_NAME_BY_CODE: Readonly<Record<string, string>> = {
  "310000": "上海",
  "440000": "广东",
};

export const CAPABILITY_LABELS: Readonly<Record<string, string>> = {
  retirement: "退休",
  pension: "养老",
  medical: "医保",
  unemployment: "失业",
  flexible: "灵活就业",
  subsidy: "补贴",
  "mi-2030": "医保",
  "mi-2026-missing": "医保",
  "ui-amount": "失业",
  "claim-city-missing": "失业",
  "base-boundary": "缴费基数",
};

export const EMPLOYMENT_LABELS: Readonly<Record<string, string>> = {
  employed: "在职（单位参保）",
  flexible: "灵活就业",
  unemployed: "失业",
};

export const GENDER_LABELS: Readonly<Record<string, string>> = {
  male: "男性",
  female: "女性",
};

export const FEMALE_RETIRE_TYPE_LABELS: Readonly<Record<string, string>> = {
  worker50: "女工人口径",
  cadre55: "女干部口径",
};

export function regionLabel(jurisdictionCode: unknown): string {
  if (typeof jurisdictionCode === "string" && REGION_NAME_BY_CODE[jurisdictionCode]) {
    return REGION_NAME_BY_CODE[jurisdictionCode];
  }
  return typeof jurisdictionCode === "string" && jurisdictionCode ? jurisdictionCode : "—";
}

export function capabilityLabel(capability: unknown): string {
  if (typeof capability === "string" && CAPABILITY_LABELS[capability]) return CAPABILITY_LABELS[capability];
  return typeof capability === "string" && capability ? capability : "—";
}

/** 从多标签中提取能力键（`capability:xxx`）。 */
export function capabilityFromLabels(labels: unknown): string | null {
  if (!Array.isArray(labels)) return null;
  const hit = labels.find((l) => typeof l === "string" && l.startsWith("capability:")) as string | undefined;
  return hit ? hit.slice("capability:".length) : null;
}

/** 合成案例统一披露文案（公开页/后台/文档共用）。 */
export const SYNTHETIC_CASE_LABEL = "合成政策案例";
export const SYNTHETIC_DISCLAIMER = "本案例为合成演示，不构成个案办理决定";

/** V1（RCL-GEN-1.0）统一占位问答：页面不得作为问答展示（SHV2 §10.2/10.3）。 */
export const V1_PLACEHOLDER_USER_MESSAGE = "确定性模板生成的政策案例（无真实用户数据）";
export const V1_PLACEHOLDER_AI_RESPONSE = "由修复后的快照规划器计算期望";
export const PENDING_V2_DOC_LABEL = "待生成V2案例文档";

/** 问答是否可读：非空且不是V1占位。 */
export function hasReadableQa(userMessage: unknown, aiResponse: unknown): boolean {
  if (typeof userMessage !== "string" || typeof aiResponse !== "string") return false;
  if (userMessage.trim().length === 0 || aiResponse.trim().length === 0) return false;
  if (userMessage === V1_PLACEHOLDER_USER_MESSAGE || aiResponse === V1_PLACEHOLDER_AI_RESPONSE) return false;
  return true;
}

/** 人物条件摘要（卡片用；只读取输入事实，不做推断）。 */
export function summarizePersona(input: unknown): string {
  if (input === null || typeof input !== "object") return "—";
  const root = input as Record<string, unknown>;
  const basic = (root.basic ?? {}) as Record<string, unknown>;
  const status = (root.status ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof basic.gender === "string" && GENDER_LABELS[basic.gender]) parts.push(GENDER_LABELS[basic.gender]);
  if (typeof basic.birth_year === "number") parts.push(`${basic.birth_year}年生`);
  if (typeof status.employment_status === "string" && EMPLOYMENT_LABELS[status.employment_status]) {
    parts.push(EMPLOYMENT_LABELS[status.employment_status]);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** 从断言/期望判定是否为needs_agent结论。 */
export function isNeedsAgent(assertions: unknown, expected: unknown): boolean {
  if (Array.isArray(assertions)) {
    for (const a of assertions) {
      if (a !== null && typeof a === "object") {
        const r = a as Record<string, unknown>;
        if (r.path === "calc.needs_agent" && r.value === true) return true;
      }
    }
  }
  if (expected !== null && typeof expected !== "object") return false;
  const e = (expected ?? {}) as Record<string, unknown>;
  return e.needs_agent === true;
}
