/**
 * 任务3（JRP-FR-007/JRP-AC-007）：地区规划发布完整激活门禁。
 *
 * 激活候选快照前必须真实执行七道门禁，任何一道失败即拒绝激活（fail-closed）：
 * 1. reference      引用完整性：每条 evidence 可回溯仓库原件且摘录逐字；
 * 2. schema         DSL JSON-Schema：每条规则成员结构合法；
 * 3. param_deps     参数依赖：每条规则的 parameter_refs 都能在快照参数成员解析；
 * 4. conflicts      地区无未解决政策冲突；
 * 5. golden_tests   黄金测试：按地区继承链加载测试并用快照成员重放全部通过；
 * 6. replay_twice   双重重放：同一快照两次执行逐字节一致（确定性）；
 * 7. content_hash   规范化成员哈希与快照 contentHash 一致（防篡改）。
 *
 * 全部通过后 gateResults 才会记录真实逐项 pass；伪造 pass 无法绕过
 * （用例层不再允许直接写入 `snapshot_replay: "pass"`）。
 */
import { createHash } from "node:crypto";
import { validateRuleAgainstSchema } from "@/lib/dsl/schema-validator";
import { verifyEvidenceIntegrity, collectEvidenceEntries } from "@/lib/dsl/citation-verifier";
import {
  orchestrateSnapshot,
  snapshotRulesToDefinitions,
  snapshotParamsToFlat,
} from "@/lib/engine/orchestrator";
import { runTestCase } from "@/lib/engine/test-runner";
import type { TestRow } from "@/server/modules/rules/application/ports";

/** 七道门禁的稳定键（gateResults 必须全为 "pass"）。 */
export const RELEASE_GATE_KEYS = [
  "reference",
  "schema",
  "param_deps",
  "conflicts",
  "golden_tests",
  "replay_twice",
  "content_hash",
] as const;

export type ReleaseGateKey = (typeof RELEASE_GATE_KEYS)[number];

export interface ReleaseGateSnapshot {
  snapshot: {
    id: string;
    jurisdictionCode: string;
    contentHash: string;
    asOfDate?: string | null;
  };
  members: Array<{
    entityType: "rule" | "param" | "rule_set";
    businessKey: string;
    payload: Record<string, unknown>;
    provenance: unknown;
  }>;
}

export interface ReleaseGateDeps {
  /** 快照（含成员）。 */
  snapshot: ReleaseGateSnapshot;
  /** 目标地区。 */
  jurisdictionCode: string;
  /** 地区未解决冲突列表（JRP-AC-007）。 */
  listOpenConflicts: (code: string) => Promise<unknown[]>;
  /** 黄金测试加载（按地区继承链：目标地区 + CN）。 */
  loadTests: (jurisdictionCodes: string[]) => Promise<TestRow[]>;
  /**
   * 参数依赖全集键（JRP-FR-007 参数依赖门禁）：目标地区 + CN 的全部已发布
   * 参数 businessKey。规则引用的参数必须能在快照成员或本全集解析；仅在
   * 日期窗口外（如广东2030参数对2026快照）属于设计内能力级缺口（JRP-FR-020），
   * 参数ID存在即视为依赖有效——拼写错误/断裂的引用仍被拒绝。
   */
  listParamKeys?: (jurisdictionCodes: string[]) => Promise<string[]>;
  /** 引用校验（默认读取仓库原件；测试可注入假实现）。 */
  verifyEvidence?: typeof verifyEvidenceIntegrity;
}

export type GateResult =
  | "pass"
  | { fail: string };

export type ReleaseGateResults = Record<ReleaseGateKey, GateResult>;

export interface ReleaseGateOutput {
  ok: boolean;
  gateResults: ReleaseGateResults;
  errors: string[];
}

/**
 * 规范化成员哈希（与 snapshot-service 创建时完全一致：整体 members 数组经
 * canonical 键排序 + Date→ISO，成员按 entityType+businessKey 确定性排序）——
 * 执行期重算可复现（JRP-FR-026）。直接复用 snapshot-service 导出的 canonical。
 */
import { canonical as canonicalSort } from "@/server/modules/policy/application/snapshot-service";

export function canonicalMemberHash(
  members: ReleaseGateSnapshot["members"],
): string {
  const sorted = [...members].sort(
    (a, b) =>
      a.entityType.localeCompare(b.entityType) ||
      a.businessKey.localeCompare(b.businessKey),
  );
  return createHash("sha256").update(canonicalSort(sorted)).digest("hex");
}

/** 从快照成员解析有序规则/参数/规则集（与 compute 用例同一语义）。 */
function memberToEngineInput(snapshot: ReleaseGateSnapshot) {
  const rules: Array<Record<string, unknown>> = [];
  const params: Array<Record<string, unknown>> = [];
  let ruleSet: { ruleSetId: string; rules: string[]; version: number } | null =
    null;
  for (const m of snapshot.members) {
    if (m.entityType === "rule") rules.push(m.payload);
    else if (m.entityType === "param") params.push(m.payload);
    else if (m.entityType === "rule_set") {
      const rs = m.payload as Record<string, unknown>;
      ruleSet = {
        ruleSetId: String(rs.ruleSetId ?? rs.rule_set_id ?? "snapshot"),
        rules: Array.isArray(rs.rules) ? (rs.rules as string[]) : [],
        version: typeof rs.version === "number" ? rs.version : 1,
      };
    }
  }
  return { rules, params, ruleSet };
}

/**
 * 真实执行全部七道门禁（JRP-FR-007）。任何一道 fail → ok=false 且零写入。
 */
export async function runReleaseGates(
  deps: ReleaseGateDeps,
): Promise<ReleaseGateOutput> {
  const { snapshot, jurisdictionCode } = deps;
  const errors: string[] = [];
  const gateResults = {} as ReleaseGateResults;

  // 1) reference：收集全部成员 evidence 并校验。
  const allEvidence = snapshot.members.flatMap((m) =>
    collectEvidenceEntries(m.payload),
  );
  const evidenceResult = (deps.verifyEvidence ?? verifyEvidenceIntegrity)(
    allEvidence,
  );
  if (evidenceResult.verified && evidenceResult.checked > 0) {
    gateResults.reference = "pass";
  } else {
    const fail = evidenceResult.errors.join("; ");
    errors.push(`reference: ${fail || "无 evidence 可校验"}`);
    gateResults.reference = { fail: fail || "无 evidence 可校验" };
  }

  // 2) schema：每条规则成员经 DSL JSON-Schema 校验。
  const ruleMembers = snapshot.members.filter(
    (m) => m.entityType === "rule",
  );
  const schemaErrors: string[] = [];
  for (const m of ruleMembers) {
    const row = m.payload as Record<string, unknown>;
    const result = validateRuleAgainstSchema(row as never);
    if (!result.valid) {
      schemaErrors.push(`${m.businessKey}: ${result.errors.join("; ")}`);
    }
  }
  if (schemaErrors.length === 0 && ruleMembers.length > 0) {
    gateResults.schema = "pass";
  } else {
    const fail = schemaErrors.join("; ") || "快照无规则成员";
    errors.push(`schema: ${fail}`);
    gateResults.schema = { fail };
  }

  // 3) param_deps：每条规则的 parameter_refs 都能解析——参数要么在快照成员中，
  // 要么在地区/国家已发布参数全集（业务键）中存在。日期窗口外参数（如广东
  // 2030 参数对 2026 快照）属于设计内能力级缺口（JRP-FR-020），参数 ID 存在
  // 即有效；拼写错误/断裂的引用仍被拒绝（fail-closed）。
  const paramKeys = new Set(
    snapshot.members
      .filter((m) => m.entityType === "param")
      .map((m) => m.businessKey),
  );
  const publishedParamKeys = new Set(
    deps.listParamKeys
      ? await deps.listParamKeys([jurisdictionCode, "CN"])
      : [],
  );
  const depErrors: string[] = [];
  for (const m of ruleMembers) {
    // 快照成员 payload 是 DB 行形状（camelCase parameterRefs）。
    const refs = m.payload.parameterRefs as
      | Array<{ param_id?: string }>
      | undefined;
    for (const ref of refs ?? []) {
      if (ref.param_id && !paramKeys.has(ref.param_id) && !publishedParamKeys.has(ref.param_id)) {
        depErrors.push(`${m.businessKey} 依赖缺失参数 ${ref.param_id}`);
      }
    }
  }
  if (depErrors.length === 0) {
    gateResults.param_deps = "pass";
  } else {
    errors.push(`param_deps: ${depErrors.join("; ")}`);
    gateResults.param_deps = { fail: depErrors.join("; ") };
  }

  // 4) conflicts：地区无未解决冲突。
  const openConflicts = await deps.listOpenConflicts(jurisdictionCode);
  if (openConflicts.length === 0) {
    gateResults.conflicts = "pass";
  } else {
    errors.push(`conflicts: ${openConflicts.length} 个未解决冲突`);
    gateResults.conflicts = { fail: `${openConflicts.length} 个未解决冲突` };
  }

  // 5) golden_tests：按继承链（目标地区 + CN）加载测试并用快照成员重放。
  // 复用规则测试运行器同一语义：rule_id 测试单规则执行，无 rule_id 全量编排；
  // expected 深度部分匹配（与 admin 测试运行器 deepPartialDiff 一致）。
  const tests = await deps.loadTests([jurisdictionCode, "CN"]);
  const goldenErrors: string[] = [];
  const { rules, params, ruleSet } = memberToEngineInput(snapshot);
  const asOfDate = snapshot.snapshot.asOfDate ?? "2026-01-01";
  const ruleDefs = snapshotRulesToDefinitions(
    rules as unknown as Parameters<typeof snapshotRulesToDefinitions>[0],
  );
  const flatBaseParams = snapshotParamsToFlat(
    params as unknown as Parameters<typeof snapshotParamsToFlat>[0],
  );
  for (const t of tests) {
    const result = runTestCase(
      {
        rule_id: t.ruleId ?? null,
        name: t.name,
        input: (t.input ?? {}) as Record<string, unknown>,
        params_override: (t.paramsOverride as Record<string, unknown>) ?? null,
        expected: (t.expected ?? {}) as Record<string, unknown>,
      },
      ruleDefs,
      flatBaseParams,
      asOfDate,
    );
    if (!result.pass) {
      // 浮点表示噪声（如 5000*(0.2+0.1)=1500.0000000000002）是既有已知偏差
      // （golden.test.ts KNOWN_DIVERGENCES），金额/展示层取整问题，非策略回归。
      // 门禁比较对纯数值 diff 使用相对容差，其余字段仍严格比较（fail-closed）。
      const tolerated = result.diff.every((d) => {
        if (typeof d.expected === "number" && typeof d.actual === "number") {
          const scale = Math.max(1, Math.abs(d.expected), Math.abs(d.actual));
          return Math.abs(d.expected - d.actual) / scale < 1e-9;
        }
        return false;
      });
      if (tolerated && result.diff.length > 0) continue;
      const diffs = result.diff
        .map((d) => `${d.path} 期望 ${JSON.stringify(d.expected)} 实际 ${JSON.stringify(d.actual)}`)
        .join("; ");
      goldenErrors.push(`${t.name}: ${diffs || "断言失败"}`);
    }
  }
  if (goldenErrors.length === 0) {
    gateResults.golden_tests = "pass";
  } else {
    errors.push(`golden_tests: ${goldenErrors.slice(0, 5).join("; ")}`);
    gateResults.golden_tests = { fail: goldenErrors.slice(0, 5).join("; ") };
  }

  // 6) replay_twice：同一快照两次执行逐字节一致（确定性，JRP-NFR-002）。
  // trace 中的 timestamp 是执行时钟（Date.now()），不属于政策结果；
  // 剥离后再比较，避免毫秒抖动造成假阳性。
  const stripTraceTimestamps = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripTraceTimestamps);
    if (value !== null && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if ("timestamp" in obj) {
        const { timestamp: _ts, ...rest } = obj;
        void _ts;
        return Object.fromEntries(
          Object.entries(rest).map(([k, v]) => [k, stripTraceTimestamps(v)]),
        );
      }
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, stripTraceTimestamps(v)]),
      );
    }
    return value;
  };
  const runOnce = () =>
    orchestrateSnapshot({
      user: { basic: { gender: "male", birth_year: 1973 } },
      asOfDate,
      ruleSet,
      rules: rules as never,
      params: params as never,
    });
  const first = stripTraceTimestamps(runOnce());
  const second = stripTraceTimestamps(runOnce());
  if (JSON.stringify(first) === JSON.stringify(second)) {
    gateResults.replay_twice = "pass";
  } else {
    errors.push("replay_twice: 两次重放结果不一致");
    gateResults.replay_twice = { fail: "两次重放结果不一致" };
  }

  // 7) content_hash：重算成员哈希与快照 contentHash 一致。
  const recomputed = canonicalMemberHash(snapshot.members);
  if (recomputed === snapshot.snapshot.contentHash) {
    gateResults.content_hash = "pass";
  } else {
    errors.push(
      `content_hash: 成员哈希漂移（期望 ${snapshot.snapshot.contentHash.slice(0, 12)}… 实际 ${recomputed.slice(0, 12)}…）`,
    );
    gateResults.content_hash = { fail: "成员哈希与快照记录不一致" };
  }

  return { ok: errors.length === 0, gateResults, errors };
}