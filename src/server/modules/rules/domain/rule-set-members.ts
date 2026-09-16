/**
 * APR-FR-004/005/007 + APR-NFR-001/002：规则集成员解析（纯函数）。
 *
 * 复用 policy 域 mergePolicyContext 的地区继承、有效期与显式overlay语义
 * （NRP-FR-007），不在rules域重新发明第二套合并规则：
 * - 输出顺序与持久化 rule_id[] 完全一致（展示顺序即执行顺序，绝不重排）；
 * - 每个成员返回实际来源地区、解析版本、状态与生效overlay操作；
 * - 无法解析（编号不存在、不在继承链、overlay冲突）标记 missing=true，
 *   保留原位置且不猜测（失败模式表）；
 * - 规则名称缺失（空串）返回 null，由页面显示编号并标记"名称不可用"。
 */
import {
  mergePolicyContext,
  type EffectiveEntity,
  type MergeInputEntity,
  type EntityProvenanceEntry,
  type OverlayOperation,
} from "@/server/modules/policy/domain/overlay";

/** 仓储批量装载的候选规则行（单查询，禁止逐成员N+1）。 */
export interface MemberRuleCandidate {
  ruleId: string;
  jurisdictionCode: string;
  policyPackId: string;
  version: number;
  name: string;
  status: string;
  operation: OverlayOperation;
  targetBusinessKey: string | null;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  /** null=长期 */
  effectiveTo: string | null;
}

/** 生效overlay载体精确身份（修复轮I2）：restrict/exempt载体不属于规则集
 * 执行顺序，但决定成员的有效语义，必须随成员视图返回供页面展开只读显示。
 * replace载体不在此列——replace后内容来源行即载体本身（contentOrigin指向它）。 */
export interface RuleSetMemberOverlay {
  operation: "restrict" | "exempt";
  ruleId: string;
  name: string | null;
  jurisdictionCode: string;
  version: number;
  effectiveFrom: string;
}

/** API契约 RuleSetMemberView（PRD §8）。 */
export interface RuleSetMemberView {
  position: number;
  ruleId: string;
  name: string | null;
  jurisdictionCode: string | null;
  version: number | null;
  status: string | null;
  operation: string | null;
  /** 按应用顺序排列的生效restrict/exempt载体（无则空数组）。 */
  overlays: RuleSetMemberOverlay[];
  /** 内容来源行自身的稳定编号（修复轮I-B1）：baseline/add时=成员编号；
   * replace生效时=替换载体行编号（其rule_id≠被指向键），供展开/详情按
   * rule_id+jurisdiction+version精确取行。missing时null。 */
  contentRuleId: string | null;
  missing: boolean;
}

/** 内容来源操作：确定成员实际来源地区/版本/名称的行。 */
const CONTENT_OPERATIONS: ReadonlySet<string> = new Set([
  "baseline",
  "add",
  "replace",
]);

function missingView(position: number, ruleId: string): RuleSetMemberView {
  return {
    position,
    ruleId,
    name: null,
    jurisdictionCode: null,
    version: null,
    status: null,
    operation: null,
    overlays: [],
    contentRuleId: null,
    missing: true,
  };
}

/**
 * 按规则集地区继承链、有效期（asOfDate）与overlay语义解析成员。
 * chain 自上而下（含目标自身，如 [CN, 310000]）。
 *
 * 装载约束：replace/restrict/exempt载体行的业务身份是被指向键——
 * 载体行自身rule_id不应直接列入成员数组（merge语义下会解析为missing；
 * 当前DSL无此形态）。成员数组应只列政策键本身，与引擎执行顺序语义一致。
 */
export function resolveRuleSetMembers(
  ruleIds: string[],
  candidates: MemberRuleCandidate[],
  chain: string[],
  asOfDate: string,
): RuleSetMemberView[] {
  const chainSet = new Set(chain);
  const usable = candidates.filter(
    // 拒绝无关地区同编号规则（FR-007）；装载方本应按链过滤，此处fail-closed双保险。
    (c) => chainSet.has(c.jurisdictionCode),
  );

  const inputs: MergeInputEntity[] = usable.map((c) => ({
    businessKey: c.ruleId,
    jurisdictionCode: c.jurisdictionCode,
    packId: c.policyPackId,
    version: c.version,
    payload: c,
    operation: c.operation,
    targetBusinessKey: c.targetBusinessKey,
    effectiveFrom: c.effectiveFrom,
    effectiveTo: c.effectiveTo,
  }));

  const { entities, conflicts } = mergePolicyContext(inputs, chain, asOfDate);

  const byKey = new Map<string, (typeof entities)[number]>();
  for (const e of entities) byKey.set(e.businessKey, e);
  const conflictKeys = new Set(conflicts.map((c) => c.businessKey));

  return ruleIds.map((ruleId, position) => {
    const entity = byKey.get(ruleId);
    // overlay冲突按businessKey归属（duplicate-add等）：不猜测，标记missing。
    if (!entity || conflictKeys.has(ruleId)) {
      return missingView(position, ruleId);
    }
    const contentOrigin = pickContentOrigin(entity.provenance);
    const payload = entity.payload as MemberRuleCandidate;
    const lastProvenance = entity.provenance[entity.provenance.length - 1];
    const name =
      typeof payload.name === "string" && payload.name.trim().length > 0
        ? payload.name.trim()
        : null;
    return {
      position,
      ruleId,
      name,
      jurisdictionCode: contentOrigin?.jurisdictionCode ?? null,
      version: contentOrigin?.version ?? null,
      status: entity.exempted ? payload.status : payload.status ?? null,
      // 展示语义：restrict/exempt等最后生效的overlay操作优先可见。
      operation: entity.exempted
        ? "exempt"
        : lastProvenance?.operation ?? contentOrigin?.operation ?? null,
      overlays: collectOverlays(entity, ruleId, usable),
      // 内容来源行自身编号（payload.ruleId）：replace后=载体行编号（I-B1）。
      contentRuleId:
        typeof payload.ruleId === "string" && payload.ruleId.length > 0
          ? payload.ruleId
          : ruleId,
      missing: false,
    };
  });
}

/**
 * 采集该成员实际生效的restrict/exempt载体（修复轮I2）。
 * restrict：mergePolicyContext把载体payload挂载到目标restrictions（精确、
 *   无损）；与provenance按（地区,版本）池化对齐，保持应用顺序。
 * exempt：provenance只留身份三元组，从候选中按（地区,版本,目标键）匹配消费。
 */
function collectOverlays(
  entity: EffectiveEntity,
  ruleId: string,
  usable: MemberRuleCandidate[],
): RuleSetMemberOverlay[] {
  const overlays: RuleSetMemberOverlay[] = [];
  const restrictPool = new Map<string, MemberRuleCandidate[]>();
  for (const raw of entity.restrictions) {
    const c = raw as MemberRuleCandidate;
    const key = `${c.jurisdictionCode}\u0000${c.version}`;
    const list = restrictPool.get(key) ?? [];
    list.push(c);
    restrictPool.set(key, list);
  }
  const usedExempt = new Set<MemberRuleCandidate>();
  for (const p of entity.provenance) {
    if (p.operation === "restrict") {
      const c = restrictPool
        .get(`${p.jurisdictionCode}\u0000${p.version}`)
        ?.shift();
      if (c) overlays.push(overlayOf("restrict", c));
    } else if (p.operation === "exempt") {
      const c = usable.find(
        (u) =>
          !usedExempt.has(u) &&
          u.operation === "exempt" &&
          u.targetBusinessKey === ruleId &&
          u.jurisdictionCode === p.jurisdictionCode &&
          u.version === p.version,
      );
      if (c) {
        usedExempt.add(c);
        overlays.push(overlayOf("exempt", c));
      }
    }
  }
  return overlays;
}

function overlayOf(
  operation: "restrict" | "exempt",
  c: MemberRuleCandidate,
): RuleSetMemberOverlay {
  const name =
    typeof c.name === "string" && c.name.trim().length > 0
      ? c.name.trim()
      : null;
  return {
    operation,
    ruleId: c.ruleId,
    name,
    jurisdictionCode: c.jurisdictionCode,
    version: c.version,
    effectiveFrom: c.effectiveFrom,
  };
}

/** 来源地区/版本 = 最近一次提供内容的实体（baseline/add/replace）。 */
function pickContentOrigin(
  provenance: EntityProvenanceEntry[],
): EntityProvenanceEntry | null {
  for (let i = provenance.length - 1; i >= 0; i--) {
    if (CONTENT_OPERATIONS.has(provenance[i].operation)) {
      return provenance[i];
    }
  }
  return provenance[0] ?? null;
}
