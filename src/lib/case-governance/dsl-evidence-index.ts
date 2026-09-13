/**
 * SHV2-FR-014 结构化政策来源索引（仓库DSL侧，零数据库）。
 *
 * 从地区Manifest发现的CN/上海/广东DSL文件建立 规则→(outputs, parameter_refs, evidence) 与
 * 参数→evidence 索引；按场景的 as-of 日期与断言路径解析"结论实际依赖"的来源：
 * - 依赖规则 = 链上（CN+地区）在as-of有效、outputs包含任一断言路径的可执行规则
 *   ∪ 模板显式声明的 sourceRuleIds（如restrict overlay元数据规则、发出追问的规则）；
 * - 依赖参数 = 依赖规则的 parameter_refs ∪ 模板显式 sourceParamIds，按as-of窗口解析且
 *   地区同键条目覆盖CN（与快照合并的add/replace语义一致）；
 * - 来源 = 上述规则与参数evidence去重（document_id+locator+excerpt），确定性排序。
 * evidence字段必须完整（12字段、64位hex SHA），否则不进入来源（不伪造）。
 */
import { readFileSync } from "node:fs";
import { discoverRegionDsl } from "@/lib/dsl/region-manifest";
import { toPolicySources, type PolicySource } from "@/lib/showcase/case-nature";

export interface DslEvidenceEntry {
  document_id: string;
  jurisdiction_code: string;
  title: string;
  authority: string;
  official_url: string;
  fetched_at: string;
  content_sha256: string;
  artifact: string;
  parse_version: string;
  locator: { type: string; reference: string };
  excerpt: string;
}

interface RuleIndexEntry {
  ruleId: string;
  jurisdictionCode: string;
  status: string;
  operation: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  outputs: string[];
  parameterRefs: string[];
  evidence: DslEvidenceEntry[];
}

interface ParamIndexEntry {
  paramId: string;
  jurisdictionCode: string;
  operation: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  evidence: DslEvidenceEntry[];
}

export interface DslEvidenceIndex {
  rules: RuleIndexEntry[];
  params: ParamIndexEntry[];
}

const META_PATHS = new Set(["calc.needs_agent", "calc.warnings", "calc.agent_questions", "calc.caveats"]);

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function normalizeEvidence(value: unknown): DslEvidenceEntry[] {
  const out: DslEvidenceEntry[] = [];
  for (const raw of asArray(value)) {
    if (raw === null || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.document_id !== "string" || typeof e.content_sha256 !== "string") continue;
    out.push(e as unknown as DslEvidenceEntry);
  }
  return out;
}

let cached: DslEvidenceIndex | null = null;

export function loadDslEvidenceIndex(): DslEvidenceIndex {
  if (cached) return cached;
  const rules: RuleIndexEntry[] = [];
  const params: ParamIndexEntry[] = [];
  for (const region of discoverRegionDsl()) {
    const jc = region.manifest.jurisdiction_code;
    for (const rf of region.ruleFiles) {
      const rule = JSON.parse(readFileSync(rf.absolutePath, "utf8")) as Record<string, unknown>;
      rules.push({
        ruleId: String(rule.rule_id),
        jurisdictionCode: jc,
        status: String(rule.status ?? ""),
        operation: String(rule.operation ?? (jc === "CN" ? "baseline" : "add")),
        effectiveFrom: String(rule.effective_from ?? "1900-01-01"),
        effectiveTo: (rule.effective_to as string | null | undefined) ?? null,
        outputs: asArray(rule.outputs)
          .map((o) => (o !== null && typeof o === "object" ? String((o as { key?: unknown }).key ?? "") : ""))
          .filter(Boolean),
        parameterRefs: asArray(rule.parameter_refs)
          .map((p) => (p !== null && typeof p === "object" ? String((p as { param_id?: unknown }).param_id ?? "") : ""))
          .filter(Boolean),
        evidence: normalizeEvidence(rule.evidence),
      });
    }
    const pack = JSON.parse(readFileSync(region.paramsPath, "utf8")) as {
      as_of?: string;
      params?: Array<Record<string, unknown>>;
      tables?: Array<Record<string, unknown>>;
    };
    for (const p of [...(pack.params ?? []), ...(pack.tables ?? [])]) {
      params.push({
        paramId: String(p.param_id),
        jurisdictionCode: jc,
        operation: String(p.operation ?? (jc === "CN" ? "baseline" : "add")),
        effectiveFrom: String(p.effective_from ?? pack.as_of ?? "1900-01-01"),
        effectiveTo: (p.effective_to as string | null | undefined) ?? null,
        evidence: normalizeEvidence(p.evidence),
      });
    }
  }
  cached = { rules, params };
  return cached;
}

function inWindow(from: string, to: string | null, asOf: string): boolean {
  if (asOf < from) return false;
  if (to !== null && asOf > to) return false;
  return true;
}

export interface ResolvePolicySourcesInput {
  jurisdictionCode: string;
  asOfDate: string;
  assertedPaths: string[];
  sourceRuleIds?: string[];
  sourceParamIds?: string[];
}

/** 解析场景结论实际依赖的结构化来源（确定性排序、去重、字段完整）。 */
export function resolvePolicySources(input: ResolvePolicySourcesInput): PolicySource[] {
  const index = loadDslEvidenceIndex();
  const chain = new Set(["CN", input.jurisdictionCode]);
  const asserted = new Set(input.assertedPaths.filter((p) => !META_PATHS.has(p)));
  const explicitRules = new Set(input.sourceRuleIds ?? []);
  const explicitParams = new Set(input.sourceParamIds ?? []);

  const depRules = index.rules.filter((r) => {
    if (!chain.has(r.jurisdictionCode)) return false;
    if (r.status !== "published") return false;
    if (!inWindow(r.effectiveFrom, r.effectiveTo, input.asOfDate)) return false;
    if (explicitRules.has(r.ruleId)) return true;
    if (r.operation === "restrict" || r.operation === "exempt") return false;
    return r.outputs.some((o) => asserted.has(o));
  });

  const paramIds = new Set<string>(explicitParams);
  for (const r of depRules) for (const pid of r.parameterRefs) paramIds.add(pid);

  // 参数按as-of窗口解析；地区同键条目覆盖CN（add/replace语义）。
  const candidates = index.params.filter(
    (p) => paramIds.has(p.paramId) && chain.has(p.jurisdictionCode) && inWindow(p.effectiveFrom, p.effectiveTo, input.asOfDate),
  );
  const byId = new Map<string, ParamIndexEntry[]>();
  for (const c of candidates) {
    const list = byId.get(c.paramId) ?? [];
    list.push(c);
    byId.set(c.paramId, list);
  }
  const depParams: ParamIndexEntry[] = [];
  for (const list of byId.values()) {
    const regional = list.filter((p) => p.jurisdictionCode !== "CN");
    depParams.push(...(regional.length > 0 ? regional : list));
  }

  const rawEvidence: DslEvidenceEntry[] = [
    ...depRules.flatMap((r) => r.evidence),
    ...depParams.flatMap((p) => p.evidence),
  ];
  const seen = new Set<string>();
  const sources: PolicySource[] = [];
  for (const p of toPolicySources(rawEvidence)) {
    const key = `${p.documentId}|${p.locator.type}|${p.locator.reference}|${p.excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(p);
  }
  sources.sort((a, b) =>
    a.documentId !== b.documentId
      ? a.documentId.localeCompare(b.documentId)
      : a.locator.reference !== b.locator.reference
        ? a.locator.reference.localeCompare(b.locator.reference)
        : a.excerpt.localeCompare(b.excerpt),
  );
  return sources;
}
