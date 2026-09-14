/**
 * 任务3（JRP-FR-025）：快照时间片确定性生成。
 *
 * 根据已批准规则/参数的有效期边界，把一条发布计划拆成不重叠的
 * `[effective_from, effective_to)` 时间片（ISO 日期，含起不含止；effectiveTo
 * 为 null 表示开放上界）。同一断言下输入相同则输出逐字节一致（JRP-NFR-002）。
 *
 * 用途：生成广东 2026 窗口与 2030 窗口两个调度区间（2030 起医保退休年限为
 * 男 30 年/女 25 年，对应 P-MI-LIFETIME-MALE/FEMALE-YEARS effective_from=2030-01-01）。
 * 本函数只做确定性派生，不写库；落库与激活由受控 Work Item 执行。
 */

export interface EffectiveWindowSource {
  /** 实体业务键（规则/参数）。 */
  businessKey: string;
  /** 有效期起点（ISO 日期，不早于窗口下界）。 */
  effectiveFrom: string;
  /** 有效期终点（ISO 日期，null=开放）。 */
  effectiveTo: string | null;
}

export interface SnapshotTimeSlice {
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface DeriveSnapshotSlicesInput {
  jurisdictionCode: string;
  /** 窗口下界（含），通常为地区首条资产生效日。 */
  lowerBound: string;
  /**
   * 已批准实体的有效期边界。切片逻辑：
   * - 按实体有效边界升序收集（businessKey 稳定排序去重）；
   * - 每个边界点结束前一片、开启后一片；
   * - 合并相同 [from,to) 区间；
   * - 其余字段（快照内容）不参与派生——切片只描述"何时用哪个快照"。
   */
  sources: EffectiveWindowSource[];
}

function sliceKey(from: string, to: string | null): string {
  return `${from}|${to ?? ""}`;
}

/**
 * 确定性派生时间片列表（JRP-FR-025）。
 * 边界点 = 各实体 effectiveFrom 与 effectiveTo；对每个连续区间输出一片。
 * 无边界时输出下界起的开放区间；空 sources 输出 `[{from: lowerBound, to: null}]`
 * （由调用方决定是否允许无实体时间片）。
 */
export function deriveSnapshotSlices(
  input: DeriveSnapshotSlicesInput,
): SnapshotTimeSlice[] {
  const bounds = new Set<string>([input.lowerBound]);

  for (const src of input.sources) {
    const from = src.effectiveFrom ?? input.lowerBound;
    if (from >= input.lowerBound) bounds.add(from);
    if (src.effectiveTo !== null && src.effectiveTo > input.lowerBound) {
      bounds.add(src.effectiveTo);
    }
  }

  const sorted = [...bounds].sort();
  const slices: SnapshotTimeSlice[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const from = sorted[i];
    const to = i + 1 < sorted.length ? sorted[i + 1] : null;
    if (to !== null && to <= from) continue;
    if (i + 1 < sorted.length && from === to) continue;
    const key = sliceKey(from, to);
    if (seen.has(key)) continue;
    seen.add(key);
    slices.push({ effectiveFrom: from, effectiveTo: to });
  }

  return slices;
}