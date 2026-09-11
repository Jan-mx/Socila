/**
 * WI-20260911-03（SHV2-FR-017～023）受控原位改写核心（单元层，零数据库）：
 *
 * - 0019审计批次/条目绑定字段与确定性派生（批次ID v5、planHash覆盖全部写集合）；
 * - 108条entries（36 case + 36 showcase + 36 regression test）逐条新旧UID/hash完整；
 * - 行投影：保留整数ID、V1→V2升级、case_text写入、transcript不虚构、last_run清空；
 * - 参数守卫：apply缺任一授权参数即拒绝；
 * - 状态分类：pending/applied（noop）/drift（部分完成禁止补写）；
 * - 指纹：业务行+快照+release规范化指纹，任一字段漂移即变化。
 */
import { describe, it, expect } from "vitest";
import {
  REWRITE_ALGORITHM_VERSION,
  SOURCE_GENERATOR_VERSION,
  TARGET_GENERATOR_VERSION,
  REWRITE_ENTRY_COUNT,
  REWRITE_ADVISORY_LOCK_KEY,
  CaseRewriteError,
  parseRewriteArgs,
  deriveRewriteBatchId,
  sourceArtifactFingerprint,
  sourceAttestation,
  matchRowsToScenarios,
  projectRewrittenCaseRow,
  projectRewrittenShowcaseRow,
  projectRewrittenTestRow,
  buildRewritePlan,
  rewritePlanHash,
  verifyPlanBody,
  classifyRewriteState,
  rowsFingerprint,
  type GeneratedSource,
  type RewritePlan,
} from "../rewrite-v2";
import { generateShowcaseScenariosV2 } from "@/lib/case-governance/generator-v2";
import { rowContentHash, CASE_INFRA_COLUMNS } from "@/lib/case-governance/hashes";
import { computeExpectedInMemory } from "@/lib/case-governance/__tests__/engine-chain-v2";

const SHA256_HEX = /^[0-9a-f]{64}$/;

async function freshSource(): Promise<GeneratedSource> {
  const scenarios = await generateShowcaseScenariosV2(computeExpectedInMemory);
  return { scenarios, libraryManifestHash: "a".repeat(64), coverageManifest: { manifestHash: "b".repeat(64) } };
}

/** 构造与场景匹配的V1行夹具（形状=DB行投影，业务字段齐全）。 */
function v1Fixtures(source: GeneratedSource) {
  const caseRows: Array<Record<string, unknown>> = [];
  const showcaseRows: Array<Record<string, unknown>> = [];
  const testRows: Array<Record<string, unknown>> = [];
  source.scenarios.forEach((s, i) => {
    const oldUid = `RPC-${s.jurisdictionCode}-${s.scenarioKey}-V1`;
    caseRows.push({
      id: 100 + i,
      case_uid: oldUid,
      creator: null,
      video_id: null,
      topics: null,
      case_text: null,
      transcript_text: null,
      tags: null,
      is_regression: true,
      source_file: null,
      jurisdiction_code: s.jurisdictionCode,
      quality_score: 88,
      quality_status: "active",
      governance_reason: "RCL确定性模板生成（无真实用户数据）",
      scenario_key: s.scenarioKey,
      generator_version: SOURCE_GENERATOR_VERSION,
      as_of_date: s.asOfDate,
      snapshot_hash: s.snapshotContentHash,
      coverage_obligations: s.coverageObligations,
      evidence: [{ documentId: "DOC-SH-POLICY-2025", locator: "正文" }],
      quality_breakdown: {},
      multi_labels: s.tags,
      input: s.input,
      expected: {},
      assertions: s.assertions.map((a) => ({ ...a, value: null })),
    });
    showcaseRows.push({
      id: 200 + i,
      case_uid: oldUid,
      title: `政策案例 ${oldUid}`,
      tags: s.tags,
      user_message: "确定性模板生成的政策案例（无真实用户数据）",
      ai_response: "由修复后的快照规划器计算期望",
      input_data: s.input,
      expected_data: {},
      category: null,
      is_published: true,
      sort_order: 0,
      jurisdiction_code: s.jurisdictionCode,
      source_case_uid: oldUid,
      snapshot_id: s.snapshotId,
      quality_score: 88,
      quality_status: "selected",
      curated_at: null,
      curated_by: "rcl-generator",
      scenario_key: s.scenarioKey,
      generator_version: SOURCE_GENERATOR_VERSION,
      as_of_date: s.asOfDate,
      snapshot_hash: s.snapshotContentHash,
      coverage_obligations: s.coverageObligations,
      evidence: [{ documentId: "DOC-SH-POLICY-2025", locator: "正文" }],
      quality_breakdown: {},
      multi_labels: s.tags,
      assertions: s.assertions.map((a) => ({ ...a, value: null })),
    });
    testRows.push({
      id: 300 + i,
      name: `RPCT-${s.jurisdictionCode}-${s.scenarioKey}-V1`,
      jurisdiction_code: s.jurisdictionCode,
      rule_id: null,
      input: { user: s.input },
      params_override: null,
      expected: {},
      source: "regression",
      source_case_uid: oldUid,
      last_run_result: { pass: true },
      last_run_at: new Date("2026-09-10T00:00:00Z"),
    });
  });
  return { caseRows, showcaseRows, testRows };
}

const SNAPSHOTS = [
  { id: "11111111-1111-4111-8111-111111111111", jurisdiction_code: "310000", as_of_date: "2026-09-01", content_hash: "c".repeat(64) },
  { id: "22222222-2222-4222-8222-222222222222", jurisdiction_code: "440000", as_of_date: "2026-09-01", content_hash: "d".repeat(64) },
  { id: "33333333-3333-4333-8333-333333333333", jurisdiction_code: "440000", as_of_date: "2030-01-01", content_hash: "e".repeat(64) },
];
const RELEASES = [
  { id: 1, jurisdiction_code: "310000", active_snapshot_id: SNAPSHOTS[0].id, status: "active", effective_from: "2026-09-01", effective_to: null },
  { id: 2, jurisdiction_code: "440000", active_snapshot_id: SNAPSHOTS[1].id, status: "active", effective_from: "2026-09-01", effective_to: "2029-12-31" },
  { id: 3, jurisdiction_code: "440000", active_snapshot_id: SNAPSHOTS[2].id, status: "active", effective_from: "2030-01-01", effective_to: null },
];

async function buildTestPlan(): Promise<{ plan: RewritePlan; source: GeneratedSource }> {
  const source = await freshSource();
  const { caseRows, showcaseRows, testRows } = v1Fixtures(source);
  const matched = matchRowsToScenarios({
    caseRows,
    showcaseRows,
    testRows,
    scenarios: source.scenarios,
  });
  expect(matched.mismatches).toEqual([]);
  const plan = buildRewritePlan({
    codeSha: "1".repeat(40),
    source,
    targetFingerprint: "f".repeat(64),
    matched,
    snapshotRows: SNAPSHOTS,
    releaseRows: RELEASES,
    exampleTestRows: [{ id: 900, name: "EX-1", source: "example", jurisdiction_code: "310000", input: {}, expected: {} }],
  });
  return { plan, source };
}

describe("SHV2-FR-017/018 常量、批次ID与planHash", () => {
  it("算法版本与生成器版本固定；条目数=108；advisory锁键为确定性有符号bigint字符串", () => {
    expect(REWRITE_ALGORITHM_VERSION).toBe("RCL-REWRITE-2.0");
    expect(SOURCE_GENERATOR_VERSION).toBe("RCL-GEN-1.0");
    expect(TARGET_GENERATOR_VERSION).toBe("RCL-GEN-2.0");
    expect(REWRITE_ENTRY_COUNT).toBe(108);
    expect(REWRITE_ADVISORY_LOCK_KEY).toMatch(/^-?\d+$/);
    const h = REWRITE_ADVISORY_LOCK_KEY;
    expect(h.length).toBeLessThanOrEqual(20);
  });

  it("批次ID由planHash确定性派生（v5版本位），相同输入一致、不同输入不同", async () => {
    const { plan } = await buildTestPlan();
    const a = deriveRewriteBatchId(plan.planHash);
    const b = deriveRewriteBatchId(plan.planHash);
    expect(a).toBe(b);
    expect(a).not.toBe(plan.planHash);
    const c = deriveRewriteBatchId("0".repeat(64));
    expect(c).not.toBe(a);
    for (const id of [a, c]) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("planHash由正文确定性计算：任一entry字段或绑定变化都改变planHash；manifestHash不含planHash自身", async () => {
    const { plan } = await buildTestPlan();
    const h1 = rewritePlanHash(plan);
    const h2 = rewritePlanHash(plan);
    expect(h1).toBe(plan.planHash);
    expect(h2).toBe(h1);
    const forged = structuredClone(plan) as RewritePlan;
    forged.entries[0] = { ...forged.entries[0], newUid: "RPC-X" };
    expect(rewritePlanHash(forged)).not.toBe(h1);
    const forged2 = structuredClone(plan) as RewritePlan;
    forged2.targetFingerprint = "0".repeat(64);
    expect(rewritePlanHash(forged2)).not.toBe(h1);
    const forged3 = structuredClone(plan) as RewritePlan;
    forged3.snapshotBindings = [...forged3.snapshotBindings];
    forged3.snapshotBindings[0] = { ...forged3.snapshotBindings[0], snapshotId: "99999999-9999-4999-8999-999999999999" };
    expect(rewritePlanHash(forged3)).not.toBe(h1);
    // planHash字段本身不进入hash（自校验语义）。
    const withOtherHash = { ...structuredClone(plan), planHash: "z".repeat(64) } as RewritePlan;
    expect(rewritePlanHash(withOtherHash)).toBe(h1);
  });

  it("来源工件指纹与attestation：内容变化即变化；不携带连接串", async () => {
    const s1 = await freshSource();
    const s2 = await freshSource();
    expect(sourceArtifactFingerprint(s1)).toBe(sourceArtifactFingerprint(s2));
    expect(sourceArtifactFingerprint(s1)).toMatch(SHA256_HEX);
    const mutated = structuredClone(s1);
    mutated.scenarios[0] = { ...mutated.scenarios[0], caseUid: "RPC-310000-CHANGED-V2", contentHash: "9".repeat(64) };
    expect(sourceArtifactFingerprint(mutated)).not.toBe(sourceArtifactFingerprint(s1));
    expect(sourceAttestation(s1)).toMatch(SHA256_HEX);
    expect(JSON.stringify(sourceArtifactFingerprint(s1)) + sourceAttestation(s1)).not.toMatch(/postgres|password|54955/);
  });
});

describe("SHV2-FR-019/020 行匹配与投影（保留整数ID、V1→V2、transcript不虚构）", () => {
  it("matchRowsToScenarios按scenario_key/source_case_uid一一对应；重复或缺失报mismatch", async () => {
    const source = await freshSource();
    const { caseRows, showcaseRows, testRows } = v1Fixtures(source);
    const ok = matchRowsToScenarios({ caseRows, showcaseRows, testRows, scenarios: source.scenarios });
    expect(ok.mismatches).toEqual([]);
    expect(ok.cases).toHaveLength(36);
    expect(ok.showcases).toHaveLength(36);
    expect(ok.tests).toHaveLength(36);
    const broken = matchRowsToScenarios({
      caseRows: caseRows.slice(1),
      showcaseRows,
      testRows,
      scenarios: source.scenarios,
    });
    expect(broken.mismatches.length).toBeGreaterThan(0);
    const dup = matchRowsToScenarios({
      caseRows: [caseRows[0], caseRows[0]],
      showcaseRows,
      testRows,
      scenarios: source.scenarios,
    });
    expect(dup.mismatches.length).toBeGreaterThan(0);
  });

  it("case投影：整数ID与无关列原样保留；V2 UID/case_text/generator写入；transcript_text不虚构", async () => {
    const source = await freshSource();
    const { caseRows } = v1Fixtures(source);
    const s = source.scenarios[0];
    const row = caseRows[0];
    const out = projectRewrittenCaseRow(row, s);
    expect(out.id).toBe(row.id);
    expect(out.creator).toBe(row.creator);
    expect(out.transcript_text).toBeNull();
    expect(out.case_uid).toBe(s.caseUid);
    expect(out.case_uid).not.toBe(row.case_uid);
    expect(String(out.case_uid).endsWith("-V2")).toBe(true);
    expect(String(row.case_uid).endsWith("-V1")).toBe(true);
    expect(out.case_text).toBe(s.caseText);
    expect((out.case_text as string).length).toBeGreaterThan(200);
    expect(out.generator_version).toBe(TARGET_GENERATOR_VERSION);
    expect(out.title === undefined).toBe(true); // cases表无title列
    expect(out.user_message === undefined).toBe(true);
    expect(out.evidence).toEqual(s.policySources);
    expect(out.input).toEqual(s.input);
    expect(out.expected).toEqual(s.expected);
    expect(out.assertions).toEqual(s.assertions);
    // 投影行的规范化hash = rowContentHash（与apply事务内SELECT *重算同规则）。
    expect(rowContentHash(out, CASE_INFRA_COLUMNS)).toMatch(SHA256_HEX);
  });

  it("showcase投影：标题/问答/category来自场景；V1占位被替换；snapshot_id取场景绑定", async () => {
    const source = await freshSource();
    const { showcaseRows } = v1Fixtures(source);
    const s = source.scenarios[0];
    const out = projectRewrittenShowcaseRow(showcaseRows[0], s);
    expect(out.id).toBe(showcaseRows[0].id);
    expect(out.title).toBe(s.title);
    expect(out.user_message).toBe(s.userMessage);
    expect(out.ai_response).toBe(s.aiResponse);
    expect(out.category).toBe(s.category);
    expect(out.user_message).not.toBe("确定性模板生成的政策案例（无真实用户数据）");
    expect(out.ai_response).not.toBe("由修复后的快照规划器计算期望");
    expect(out.case_uid).toBe(s.caseUid);
    expect(out.source_case_uid).toBe(s.caseUid);
    expect(out.snapshot_id).toBe(s.snapshotId);
    expect(out.generator_version).toBe(TARGET_GENERATOR_VERSION);
  });

  it("test投影：回归test UID升级V2、期望为场景expected、last_run清空", async () => {
    const source = await freshSource();
    const { testRows } = v1Fixtures(source);
    const s = source.scenarios[0];
    const out = projectRewrittenTestRow(testRows[0], s);
    expect(out.id).toBe(testRows[0].id);
    expect(out.name).toBe(s.testUid);
    expect(out.source_case_uid).toBe(s.caseUid);
    expect(out.input).toEqual({ user: s.input });
    expect(out.expected).toEqual(s.expected);
    expect(out.last_run_result).toBeNull();
    expect(out.last_run_at).toBeNull();
    expect(out.source).toBe("regression");
  });
});

describe("SHV2-FR-018/020 精确计划（108条entries与完整绑定）", () => {
  it("plan恰好108条entries（36/36/36），逐条含整数ID、新旧UID、新旧hash、快照hash、evidenceHash与完整before/after", async () => {
    const { plan, source } = await buildTestPlan();
    expect(plan.entries).toHaveLength(REWRITE_ENTRY_COUNT);
    const byType = { case: 0, showcase_case: 0, test: 0 };
    for (const e of plan.entries) {
      byType[e.entityType] += 1;
      expect(Number.isInteger(e.entityId)).toBe(true);
      expect(e.oldUid).toMatch(/-V1$/);
      expect(e.newUid).toMatch(/-V2$/);
      expect(e.oldContentHash).toMatch(SHA256_HEX);
      expect(e.newContentHash).toMatch(SHA256_HEX);
      expect(e.oldContentHash).not.toBe(e.newContentHash);
      expect(e.newSnapshotHash).toMatch(SHA256_HEX);
      expect(e.evidenceHash).toMatch(SHA256_HEX);
      expect(Object.keys(e.before).length).toBeGreaterThan(5);
      expect(Object.keys(e.after).length).toBeGreaterThan(5);
    }
    expect(byType).toEqual({ case: 36, showcase_case: 36, test: 36 });
    expect(plan.rowCounts).toEqual({ cases: 36, showcases: 36, regressionTests: 36, entries: 108 });
    expect(plan.sourceGeneratorVersion).toBe(SOURCE_GENERATOR_VERSION);
    expect(plan.targetGeneratorVersion).toBe(TARGET_GENERATOR_VERSION);
    expect(plan.snapshotBindings).toHaveLength(3);
    expect(plan.sourceManifest.scenarioCount).toBe(36);
    expect(plan.sourceAttestation).toBe(sourceAttestation(source));
    expect(plan.algorithmVersion).toBe(REWRITE_ALGORITHM_VERSION);
  });

  it("相同输入计划逐字节一致（确定性）；任一行漂移改变plan与hash", async () => {
    const a = await buildTestPlan();
    const b = await buildTestPlan();
    expect(JSON.stringify(b.plan)).toBe(JSON.stringify(a.plan));
    const source = a.source;
    const { caseRows, showcaseRows, testRows } = v1Fixtures(source);
    const driftedRows = structuredClone(caseRows);
    (driftedRows[0] as Record<string, unknown>).quality_score = 90;
    const drifted = buildRewritePlan({
      codeSha: "1".repeat(40),
      source,
      targetFingerprint: "f".repeat(64),
      matched: matchRowsToScenarios({ caseRows: driftedRows, showcaseRows, testRows, scenarios: source.scenarios }),
      snapshotRows: SNAPSHOTS,
      releaseRows: RELEASES,
    });
    expect(drifted.planHash).not.toBe(a.plan.planHash);
    expect(drifted.entries[0].oldContentHash).not.toBe(a.plan.entries[0].oldContentHash);
  });

  it("verifyPlanBody：篡改条目数/非法hash/UID不成对返回问题清单", async () => {
    const { plan } = await buildTestPlan();
    expect(verifyPlanBody(plan)).toEqual([]);
    const short = structuredClone(plan);
    short.entries = short.entries.slice(1);
    expect(verifyPlanBody(short).length).toBeGreaterThan(0);
    const badHash = structuredClone(plan);
    badHash.entries[0] = { ...badHash.entries[0], newContentHash: "zz" };
    expect(verifyPlanBody(badHash).some((p) => /hash/i.test(p))).toBe(true);
    const badPair = structuredClone(plan);
    badPair.entries[0] = { ...badPair.entries[0], newUid: String(badPair.entries[0].oldUid) };
    expect(verifyPlanBody(badPair).some((p) => /UID/i.test(p))).toBe(true);
  });
});

describe("SHV2-FR-022 幂等与状态分类", () => {
  it("无批次=pending；applied批次+最终指纹一致+108条=applied；缺失或不一致=drift", async () => {
    const { plan } = await buildTestPlan();
    expect(
      classifyRewriteState({ batch: null, liveFingerprint: plan.targetFingerprint, finalFingerprint: plan.finalFingerprint, planHash: plan.planHash }),
    ).toBe("pending");
    expect(
      classifyRewriteState({
        batch: { planHash: plan.planHash, status: "applied", entryCount: 108 },
        liveFingerprint: plan.finalFingerprint,
        finalFingerprint: plan.finalFingerprint,
        planHash: plan.planHash,
      }),
    ).toBe("applied");
    expect(
      classifyRewriteState({
        batch: { planHash: plan.planHash, status: "applied", entryCount: 50 },
        liveFingerprint: plan.finalFingerprint,
        finalFingerprint: plan.finalFingerprint,
        planHash: plan.planHash,
      }),
    ).toBe("drift");
    expect(
      classifyRewriteState({
        batch: { planHash: plan.planHash, status: "applied", entryCount: 108 },
        liveFingerprint: plan.targetFingerprint,
        finalFingerprint: plan.finalFingerprint,
        planHash: plan.planHash,
      }),
    ).toBe("drift");
    expect(
      classifyRewriteState({
        batch: { planHash: "other", status: "applied", entryCount: 108 },
        liveFingerprint: plan.finalFingerprint,
        finalFingerprint: plan.finalFingerprint,
        planHash: plan.planHash,
      }),
    ).toBe("drift");
  });
});

describe("SHV2-FR-023 参数与指纹守卫（单元层）", () => {
  it("apply缺--i-am-authorized/--plan-hash/--target-fingerprint/--plan-file任一即拒绝；未知模式拒绝", () => {
    const base = ["apply", "--generated", "gen.json", "--plan-file", "plan.json", "--i-am-authorized", "--plan-hash", "h".repeat(64), "--target-fingerprint", "t".repeat(64)];
    expect(parseRewriteArgs(base).ok).toBe(true);
    // 逐项剔除参数（含其值）后必须以CaseRewriteError拒绝。
    const withoutArg = (name: string) => {
      const i = base.indexOf(name);
      const out = [...base];
      out.splice(i, name === "--i-am-authorized" ? 1 : 2);
      return out;
    };
    for (const name of ["--i-am-authorized", "--plan-hash", "--target-fingerprint", "--plan-file"]) {
      expect(() => parseRewriteArgs(withoutArg(name)), name).toThrowError(CaseRewriteError);
    }
    expect(() => parseRewriteArgs(["bogus"])).toThrowError(CaseRewriteError);
    expect(() => parseRewriteArgs([])).toThrowError(CaseRewriteError);
    expect(parseRewriteArgs(["audit", "--generated", "gen.json"]).ok).toBe(true);
    expect(parseRewriteArgs(["plan", "--generated", "gen.json"]).ok).toBe(true);
    expect(parseRewriteArgs(["verify", "--generated", "gen.json", "--plan-file", "plan.json"]).ok).toBe(true);
  });

  it("业务指纹：行/快照/release任一漂移即变化；相同输入确定", async () => {
    const source = await freshSource();
    const { caseRows, showcaseRows, testRows } = v1Fixtures(source);
    const f1 = rowsFingerprint({ cases: caseRows, showcases: showcaseRows, tests: testRows, snapshots: SNAPSHOTS, releases: RELEASES });
    const f2 = rowsFingerprint({ cases: caseRows, showcases: showcaseRows, tests: testRows, snapshots: SNAPSHOTS, releases: RELEASES });
    expect(f1).toBe(f2);
    expect(f1).toMatch(SHA256_HEX);
    const changedCase = structuredClone(caseRows);
    (changedCase[5] as Record<string, unknown>).case_text = "drift";
    expect(rowsFingerprint({ cases: changedCase, showcases: showcaseRows, tests: testRows, snapshots: SNAPSHOTS, releases: RELEASES })).not.toBe(f1);
    const changedSnap = structuredClone(SNAPSHOTS) as Array<Record<string, unknown>>;
    changedSnap[0] = { ...changedSnap[0], content_hash: "0".repeat(64) };
    expect(rowsFingerprint({ cases: caseRows, showcases: showcaseRows, tests: testRows, snapshots: changedSnap, releases: RELEASES })).not.toBe(f1);
    const changedRel = structuredClone(RELEASES) as Array<Record<string, unknown>>;
    changedRel[0] = { ...changedRel[0], status: "inactive" };
    expect(rowsFingerprint({ cases: caseRows, showcases: showcaseRows, tests: testRows, snapshots: SNAPSHOTS, releases: changedRel })).not.toBe(f1);
  });
});
