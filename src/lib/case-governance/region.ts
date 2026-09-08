/**
 * CLG-FR-002 地区归属（权威来源）：现有案例只能依据权威来源（回归工作簿来源
 * 或当前展示案例来源）标记为310000；不得从案例正文猜测广东440000或四川510000。
 */
export { SHANGHAI_JURISDICTION } from "./types";
import { SHANGHAI_JURISDICTION } from "./types";

export interface RegionAssignmentInput {
  /** 全部案例UID（851）。 */
  caseUids: Set<string>;
  /** 回归来源案例UID（451）。 */
  regressionCaseUids: Set<string>;
  /** 展示案例归一化来源UID（116）。 */
  showcaseSourceUids: Set<string>;
  /** 案例正文（仅用于证明不扫描正文——本函数不读取正文做地区判断）。 */
  caseTextByUid: Map<string, string>;
}

/**
 * 返回每个案例的归属地区；不在权威来源中的案例返回null（保持未归属，
 * 绝不从正文猜测）。正文参数仅作类型契约，不参与判断。
 */
export function assignRegionsFromAuthoritativeSources(
  input: RegionAssignmentInput,
): Map<string, string | null> {
  const regions = new Map<string, string | null>();
  for (const uid of input.caseUids) {
    const authoritative =
      input.regressionCaseUids.has(uid) || input.showcaseSourceUids.has(uid);
    regions.set(uid, authoritative ? SHANGHAI_JURISDICTION : null);
  }
  return regions;
}
