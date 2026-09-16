/**
 * APR-FR-004～009：规则集视图用例（详情解析、成员批量装载、选择器）。
 *
 * - 精确实体身份（rule_set_id + jurisdiction_code + version）读取与更新（APR-FR-006）；
 * - 成员解析复用policy域mergePolicyContext的地区继承、有效期与overlay语义
 *   （APR-FR-007；不建立第二套业务语义），批量单查询装载候选（APR-NFR-002）；
 * - 管理端默认as_of_date=服务器当前日期并明确回显；历史精确执行内容仍以
 *   不可变快照为准（本视图只读，不改写任何持久状态）。
 */
import { rulesReads } from "./index";
import type { RuleSetRow } from "./ports";
import {
  resolveRuleSetMembers,
  type RuleSetMemberView,
} from "../domain/rule-set-members";
import { filterSelectableRules } from "@/lib/admin/rule-selector";
import type { SelectableRuleCandidate } from "@/lib/admin/rule-selector";

export interface RuleSetLocator {
  ruleSetId: string;
  jurisdictionCode: string;
  version: number;
}

export interface RuleSetDetailView {
  ruleSet: RuleSetRow;
  /** 持久化执行顺序（原样，未重排）。 */
  rules: string[];
  members: RuleSetMemberView[];
  /** 本次成员解析使用的日期（回显给页面）。 */
  resolvedAsOfDate: string;
}

export type RuleSetViewResult =
  | { ok: true; view: RuleSetDetailView }
  | { ok: false; status: 400 | 404; error: string };

/** 服务器当前日期（YYYY-MM-DD，UTC口径——修复轮M-B9：与引擎/发布服务的
 * as_of_date口径一致，避免UTC+8凌晨窗口内管理端显示与引擎解析差一天）。 */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 合法ISO日期（用于as_of_date入参校验，APR-FR-007）。 */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** 地区继承链（自上而下含自身）；树中不存在的地区返回null（拒绝猜测）。 */
export async function resolveJurisdictionChain(
  jurisdictionCode: string,
): Promise<string[] | null> {
  const { createJurisdictionTreeService } = await import(
    "@/server/modules/jurisdiction/application/tree-service"
  );
  const { DrizzleJurisdictionReadRepository } = await import(
    "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository"
  );
  try {
    const tree = createJurisdictionTreeService({
      read: new DrizzleJurisdictionReadRepository(),
    });
    const chain = await tree.resolveChain(jurisdictionCode);
    return chain.map((node) => node.code);
  } catch {
    return null;
  }
}

/**
 * 规则集详情（APR-FR-006：缺身份400；不存在404；地区链无法解析400明确报错）。
 * 同时返回原始rules与解析后的members（PRD §8）。
 */
export async function getRuleSetDetailView(
  locator: RuleSetLocator | null,
  asOfDate: string,
): Promise<RuleSetViewResult> {
  if (
    !locator ||
    !locator.ruleSetId ||
    !locator.jurisdictionCode ||
    !Number.isInteger(locator.version) ||
    locator.version < 1
  ) {
    return {
      ok: false,
      status: 400,
      error:
        "规则集读取必须携带rule_set_id + jurisdiction_code + version精确身份（APR-FR-006）",
    };
  }
  const chain = await resolveJurisdictionChain(locator.jurisdictionCode);
  if (chain === null) {
    return {
      ok: false,
      status: 400,
      error: `地区 ${locator.jurisdictionCode} 不在地区树中，无法解析继承链（APR-FR-006不猜测）`,
    };
  }
  const ruleSet = await rulesReads.getRuleSetExact(locator);
  if (!ruleSet) {
    return {
      ok: false,
      status: 404,
      error: "未找到该地区与版本的规则集",
    };
  }
  const ruleIds = (ruleSet.rules as string[]) ?? [];
  const candidates = await rulesReads.listRuleCandidates({
    ruleIds,
    jurisdictionCodes: chain,
    asOfDate,
  });
  const members = resolveRuleSetMembers(ruleIds, candidates, chain, asOfDate);
  return {
    ok: true,
    view: {
      ruleSet,
      rules: ruleIds,
      members,
      resolvedAsOfDate: asOfDate,
    },
  };
}

/**
 * APR-FR-009选择器：继承链内当前可解析（published、as_of_date有效、无overlay冲突）
 * 的候选规则；排除已加入成员；名称/编号搜索；保存值仍为稳定编号。
 */
export async function getSelectableRules(
  locator: RuleSetLocator | null,
  asOfDate: string,
  q: string,
): Promise<
  | { ok: true; candidates: SelectableRuleCandidate[] }
  | { ok: false; status: 400 | 404; error: string }
> {
  const detail = await getRuleSetDetailView(locator, asOfDate);
  if (!detail.ok) return detail;
  const chain = await resolveJurisdictionChain(locator!.jurisdictionCode);
  if (chain === null) {
    return { ok: false, status: 400, error: "地区继承链无法解析" };
  }
  const candidates = await rulesReads.listRuleCandidates({
    ruleIds: null,
    jurisdictionCodes: chain,
    asOfDate,
  });
  // 链内全部候选按同一overlay语义解析；解析失败/冲突的编号不可加入。
  const allIds = [...new Set(candidates.map((c) => c.ruleId))];
  const resolved = resolveRuleSetMembers(allIds, candidates, chain, asOfDate);
  const resolvedOk = resolved
    .filter((m) => !m.missing)
    .map((m) => ({
      ruleId: m.ruleId,
      name: m.name ?? "",
      jurisdictionCode: m.jurisdictionCode ?? "",
      version: m.version ?? 1,
      status: m.status ?? "published",
    }));
  const memberIds = detail.view.rules;
  const filtered = filterSelectableRules(resolvedOk, memberIds, q);
  return { ok: true, candidates: filtered };
}
