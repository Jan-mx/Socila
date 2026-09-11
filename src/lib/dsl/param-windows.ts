/**
 * SHV2-FR-004 参数有效期窗口（零数据库依赖的仓库侧语义）。
 *
 * 地区参数包允许同一 `param_id` 以多个并列条目表达历史与当前版本，每个条目携带
 * `effective_from` 与可选 `effective_to`（含端点，ISO 日期）。本模块提供：
 * - `validateParamWindows`：同一 param_id 的窗口必须不重叠、时间上连续（前一窗口的
 *   `effective_to` 次日 === 后一窗口的 `effective_from`），且至多一个开放上界；
 * - `resolveParamWindowsAsOf`：按 as-of 日期解析唯一命中的窗口，得到扁平参数表；
 *   无命中的参数缺席（调用方按 needs_agent / 阻断处理），多重命中直接抛错（fail-closed）。
 */

export interface ParamPackEntry {
  param_id: string;
  type: string;
  value?: unknown;
  rows?: unknown[];
  effective_from?: string;
  effective_to?: string | null;
  source?: string;
  [key: string]: unknown;
}

export interface ParamPackFile {
  policy_pack_id: string;
  as_of?: string;
  params: ParamPackEntry[];
  tables: ParamPackEntry[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw new Error(`${label} 必须为 YYYY-MM-DD，实际：${String(value)}`);
  }
  return value;
}

/** 返回 ISO 日期的次日（UTC 计算，避免时区偏移）。 */
export function nextIsoDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

function allEntries(pack: ParamPackFile): ParamPackEntry[] {
  return [...(pack.params ?? []), ...(pack.tables ?? [])];
}

/**
 * 校验参数包内每个 param_id 的窗口序列。返回违规描述列表（空数组即通过）。
 */
export function validateParamWindows(pack: ParamPackFile): string[] {
  const violations: string[] = [];
  const byId = new Map<string, ParamPackEntry[]>();
  for (const entry of allEntries(pack)) {
    const list = byId.get(entry.param_id) ?? [];
    list.push(entry);
    byId.set(entry.param_id, list);
  }

  for (const [paramId, entries] of byId) {
    const windows = entries.map((e) => {
      const from = assertIsoDate(e.effective_from ?? pack.as_of, `${paramId}.effective_from`);
      const to = e.effective_to == null ? null : assertIsoDate(e.effective_to, `${paramId}.effective_to`);
      if (to !== null && to < from) {
        violations.push(`${paramId}: effective_to ${to} 早于 effective_from ${from}`);
      }
      return { from, to };
    });
    windows.sort((a, b) => a.from.localeCompare(b.from));

    const openEnded = windows.filter((w) => w.to === null);
    if (openEnded.length > 1) {
      violations.push(`${paramId}: 存在 ${openEnded.length} 个开放上界窗口（至多1个）`);
    }
    for (let i = 1; i < windows.length; i++) {
      const prev = windows[i - 1];
      const curr = windows[i];
      if (prev.to === null) {
        violations.push(`${paramId}: 窗口 ${prev.from}~∞ 之后仍有窗口 ${curr.from}（重叠）`);
        continue;
      }
      if (curr.from <= prev.to) {
        violations.push(`${paramId}: 窗口 ${prev.from}~${prev.to} 与 ${curr.from} 重叠`);
      } else if (nextIsoDay(prev.to) !== curr.from) {
        violations.push(
          `${paramId}: 窗口 ${prev.from}~${prev.to} 与 ${curr.from} 之间存在空档（要求连续）`,
        );
      }
    }
  }
  return violations;
}

/**
 * 解析 as-of 日期生效的扁平参数：标量取 value，table/timeline 取 rows。
 * 同一 param_id 多重命中 → 抛错（窗口重叠属于数据错误，不得静默选择）。
 */
export function resolveParamWindowsAsOf(
  pack: ParamPackFile,
  asOf: string,
): Record<string, unknown> {
  assertIsoDate(asOf, "asOf");
  const result: Record<string, unknown> = {};
  const hits = new Map<string, number>();
  for (const entry of allEntries(pack)) {
    const from = assertIsoDate(entry.effective_from ?? pack.as_of, `${entry.param_id}.effective_from`);
    const to = entry.effective_to == null ? null : assertIsoDate(entry.effective_to, `${entry.param_id}.effective_to`);
    if (asOf < from) continue;
    if (to !== null && asOf > to) continue;
    const count = (hits.get(entry.param_id) ?? 0) + 1;
    hits.set(entry.param_id, count);
    if (count > 1) {
      throw new Error(`${entry.param_id}: as-of ${asOf} 命中多个窗口（窗口重叠）`);
    }
    result[entry.param_id] =
      entry.type === "table" || entry.type === "timeline" ? (entry.rows ?? []) : entry.value;
  }
  return result;
}
