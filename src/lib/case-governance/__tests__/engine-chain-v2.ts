/**
 * SHV2测试辅助：零数据库的地区链路期望计算器（镜像快照执行路径）。
 *
 * 与 `snapshot-service.collectEntities` + `orchestrateSnapshot` 同构：
 * 1. 按 as-of 过滤 CN+地区 的规则/参数有效窗口（含闭合上界）；
 * 2. 以DSL文件显式 operation/target_business_key 经 `mergePolicyContext` 合并（不按地区推断）；
 * 3. 规则执行顺序取地区规则集 `rules` 数组；参数扁平化后经 `orchestrateSnapshot`
 *    执行（含 `calc._today` 种子与 months_to_legal_retire 自动推导）；
 * 4. 广东领取地市：与 `computeJurisdictionPlan` 一致，`profile.claim_city_code`
 *    经 `normalizeClaimCityCode` 转为内部 `claim_city`（无效/缺失则不注入）。
 *
 * snapshotId/snapshotContentHash 为链路资产的确定性指纹（内存路径无数据库快照）。
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  orchestrateSnapshot,
  type SnapshotParamRow,
  type SnapshotRuleRow,
  type SnapshotRuleSetRow,
} from "@/lib/engine/orchestrator";
import {
  mergePolicyContext,
  type MergeInputEntity,
  type OverlayOperation,
} from "@/server/modules/policy/domain/overlay";
import { normalizeClaimCityCode } from "@/server/modules/planning/application/claim-city";
import { discoverRegionDsl, type DiscoveredRegion } from "@/lib/dsl/region-manifest";
import type { EngineOutcomeV2, ScenarioTemplateV2 } from "../generator-v2";

interface RuleFile extends Record<string, unknown> {
  rule_id: string;
  dsl_version: string;
  name: string;
  module?: string;
  status: string;
  priority: number;
  effective_from: string;
  effective_to?: string | null;
  operation?: string;
  target_business_key?: string | null;
}

interface ParamEntry extends Record<string, unknown> {
  param_id: string;
  type: string;
  value?: unknown;
  rows?: unknown[];
  effective_from?: string;
  effective_to?: string | null;
  operation?: string;
  target_business_key?: string | null;
}

interface PackFile {
  policy_pack_id: string;
  as_of?: string;
  params: ParamEntry[];
  tables: ParamEntry[];
}

const regions = discoverRegionDsl();

function regionByCode(code: string): DiscoveredRegion {
  const r = regions.find((x) => x.manifest.jurisdiction_code === code);
  if (!r) throw new Error(`地区DSL缺失：${code}`);
  return r;
}

function inWindow(from: string | undefined, to: string | null | undefined, asOf: string, fallbackFrom: string): boolean {
  const f = from ?? fallbackFrom;
  if (asOf < f) return false;
  if (to != null && asOf > to) return false;
  return true;
}

function loadEntities(code: string, asOf: string): {
  entities: MergeInputEntity[];
  ruleSet: SnapshotRuleSetRow;
  fingerprintSource: string[];
} {
  const chainRegions = [regionByCode("CN"), regionByCode(code)];
  const entities: MergeInputEntity[] = [];
  const fingerprintSource: string[] = [];
  for (const region of chainRegions) {
    const jc = region.manifest.jurisdiction_code;
    for (const rf of region.ruleFiles) {
      const raw = readFileSync(rf.absolutePath, "utf8");
      fingerprintSource.push(`${jc}:rule:${rf.fileName}:${raw}`);
      const rule = JSON.parse(raw) as RuleFile;
      if (rule.status !== "published") continue;
      if (!inWindow(rule.effective_from, rule.effective_to ?? null, asOf, rule.effective_from)) continue;
      entities.push({
        businessKey: rule.rule_id,
        jurisdictionCode: jc,
        packId: "rules",
        version: 1,
        payload: rule,
        operation: (rule.operation ?? (jc === "CN" ? "baseline" : "add")) as OverlayOperation,
        targetBusinessKey: rule.target_business_key ?? null,
        effectiveFrom: asOf,
        effectiveTo: null,
      });
    }
    const packRaw = readFileSync(region.paramsPath, "utf8");
    fingerprintSource.push(`${jc}:params:${packRaw}`);
    const pack = JSON.parse(packRaw) as PackFile;
    for (const p of [...(pack.params ?? []), ...(pack.tables ?? [])]) {
      if (!inWindow(p.effective_from, p.effective_to ?? null, asOf, pack.as_of ?? "1900-01-01")) continue;
      entities.push({
        businessKey: p.param_id,
        jurisdictionCode: jc,
        packId: pack.policy_pack_id,
        version: 1,
        payload: p,
        operation: (p.operation ?? (jc === "CN" ? "baseline" : "add")) as OverlayOperation,
        targetBusinessKey: p.target_business_key ?? null,
        effectiveFrom: asOf,
        effectiveTo: null,
      });
    }
  }
  const rsRaw = readFileSync(regionByCode(code).ruleSetPath, "utf8");
  fingerprintSource.push(`${code}:rule_set:${rsRaw}`);
  const rs = JSON.parse(rsRaw) as { rule_set_id: string; rules: string[] };
  return { entities, ruleSet: { ruleSetId: rs.rule_set_id, rules: rs.rules, version: 1 }, fingerprintSource };
}

const cache = new Map<string, ReturnType<typeof buildChain>>();

function buildChain(code: string, asOf: string) {
  const { entities, ruleSet, fingerprintSource } = loadEntities(code, asOf);
  const merged = mergePolicyContext(entities, ["CN", code], asOf);
  if (merged.conflicts.length > 0) {
    throw new Error(`[engine-chain-v2] ${code}@${asOf} 合并冲突：${JSON.stringify(merged.conflicts)}`);
  }
  const rules: SnapshotRuleRow[] = [];
  const params: SnapshotParamRow[] = [];
  for (const e of merged.entities) {
    if (e.exempted) continue;
    const payload = e.payload as Record<string, unknown>;
    const packId = e.provenance[e.provenance.length - 1]?.packId ?? "";
    if (typeof payload.rule_id === "string") {
      // restrict/exempt 元数据实体不进入可执行序列（与快照执行一致）。
      const op = String(payload.operation ?? "");
      if (op === "restrict" || op === "exempt") continue;
      rules.push({
        ruleId: String(payload.rule_id),
        dslVersion: String(payload.dsl_version),
        name: String(payload.name),
        module: String(payload.module ?? ""),
        status: String(payload.status),
        priority: Number(payload.priority ?? 0),
        effectiveFrom: String(payload.effective_from),
        effectiveTo: (payload.effective_to as string | null | undefined) ?? null,
        supersedes: payload.supersedes ?? [],
        inputs: payload.inputs ?? [],
        parameterRefs: payload.parameter_refs ?? [],
        decisionTable: payload.decision_table ?? {},
        outputs: payload.outputs ?? [],
        examples: payload.examples ?? [],
        evidence: payload.evidence ?? [],
        notes: (payload.notes as string | undefined) ?? null,
      });
    } else if (typeof payload.param_id === "string") {
      params.push({
        paramId: String(payload.param_id),
        type: String(payload.type),
        value: payload.value,
        rows: payload.rows,
        effectiveFrom: String(payload.effective_from ?? asOf),
        effectiveTo: (payload.effective_to as string | null | undefined) ?? null,
        policyPackId: packId,
        version: 1,
      });
    }
  }
  const fingerprint = createHash("sha256")
    .update(fingerprintSource.sort().join("\n"), "utf8")
    .digest("hex");
  return { rules, params, ruleSet, fingerprint };
}

function chainFor(code: string, asOf: string) {
  const key = `${code}|${asOf}`;
  let c = cache.get(key);
  if (!c) {
    c = buildChain(code, asOf);
    cache.set(key, c);
  }
  return c;
}

/** 内存链路期望计算（注入 generateShowcaseScenariosV2 的 computeExpected）。 */
export function computeExpectedInMemory(
  t: Pick<ScenarioTemplateV2, "jurisdictionCode" | "asOfDate" | "input">,
): EngineOutcomeV2 {
  const chain = chainFor(t.jurisdictionCode, t.asOfDate);
  const user = structuredClone(t.input) as Record<string, unknown>;
  const profile = user.profile as Record<string, unknown> | undefined;
  if (profile) {
    const normalized = normalizeClaimCityCode({
      jurisdictionCode: t.jurisdictionCode,
      claimCityCode: typeof profile.claim_city_code === "string" ? profile.claim_city_code : null,
    });
    delete profile.claim_city_code;
    if (normalized.claimCity !== null) profile.claim_city = normalized.claimCity;
    else delete profile.claim_city;
  }
  const result = orchestrateSnapshot({
    user,
    asOfDate: t.asOfDate,
    ruleSet: chain.ruleSet,
    rules: structuredClone(chain.rules),
    params: structuredClone(chain.params),
  });
  return {
    snapshotId: `inmem-${t.jurisdictionCode}-${t.asOfDate}`,
    snapshotContentHash: chain.fingerprint,
    calc: result.calc as Record<string, unknown>,
    plan: result.plan as Record<string, unknown>,
    user: result.user as Record<string, unknown>,
  };
}

/** 直接对任意用户输入执行地区链路（反例测试用）。 */
export function runChain(
  jurisdictionCode: string,
  asOfDate: string,
  input: Record<string, unknown>,
): EngineOutcomeV2 {
  return computeExpectedInMemory({ jurisdictionCode: jurisdictionCode as "310000" | "440000", asOfDate, input });
}
