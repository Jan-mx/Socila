/**
 * 任务3（JRP-FR-010/012/015）地区选择器纯逻辑（可单测，零DOM依赖）。
 *
 * - 首期支持上海310000与广东440000；四川510000明确显示"暂未支持"且不可选；
 * - 确认请求只携带稳定代码，服务端校验并写入会话画像（JRP-FR-015）；
 * - 选择器不产生任何候选文本→权威地区的映射（自由文本不参与政策选择）。
 */

export interface PlanningJurisdictionOption {
  code: string;
  name: string;
  supported: boolean;
  reason?: string;
}

/** 首期可选地区（JRP-FR-013：按地区独立开放；四川延期不创建发布记录）。 */
export const PLANNING_JURISDICTION_OPTIONS: PlanningJurisdictionOption[] = [
  { code: "310000", name: "上海市", supported: true },
  { code: "440000", name: "广东省", supported: true },
  { code: "510000", name: "四川省", supported: false, reason: "暂未支持" },
];

/** 地区是否可用于规划（JRP-AC-003/017：四川未激活不得可选）。 */
export function isSupportedPlanningJurisdiction(code: string): boolean {
  return PLANNING_JURISDICTION_OPTIONS.some(
    (o) => o.code === code && o.supported,
  );
}

/** 构造确认请求（POST /api/conversations/:id/jurisdiction，仅稳定代码）。 */
export function buildJurisdictionConfirmRequest(
  conversationId: string,
  code: string,
): { url: string; body: { code: string; source: "selector" } } {
  return {
    url: `/api/conversations/${encodeURIComponent(conversationId)}/jurisdiction`,
    body: { code, source: "selector" },
  };
}

/** 从会话画像读取已确认地区（服务端规范化形态）。 */
export function readJurisdictionFromProfile(
  profile: Record<string, unknown> | null | undefined,
): { code: string; name: string } | null {
  if (!profile || typeof profile !== "object") return null;
  const j = profile.jurisdiction;
  if (!j || typeof j !== "object") return null;
  const jr = j as Record<string, unknown>;
  if (jr.confirmed !== true || typeof jr.code !== "string") return null;
  return {
    code: jr.code,
    name: typeof jr.name === "string" ? jr.name : jr.code,
  };
}
