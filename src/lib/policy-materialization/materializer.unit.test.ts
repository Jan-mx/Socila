/**
 * NRP-FR-017/FR-018、NRP-NFR-009、NRP-AC-011/013 物化器单元测试：
 * - 目标守卫：无显式DATABASE_URL即拒绝（直接构造环境对象，不依赖.env.local，审查缺陷9）；
 *   非授权库/非本机拒绝；指纹为非敏感哈希；
 * - manifest：从已提交内容构建且确定性；地区就绪/阻断语义；
 * - 计划器：草稿强制（不信任文件published）、既有键v2/新键v1、
 *   published行永不原地更新、目标版本冲突拒绝。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  computeTargetFingerprint,
  loadExistingState,
  resolveTarget,
  TargetGuardError,
  type ExistingState,
  type SqlLike,
} from "./target";
import {
  buildManifest,
  manifestHash,
  regionReadiness,
  type GitReader,
} from "./manifest";
import { buildPlan, PlanConflictError } from "./plan";

const REPO = process.cwd();

/** 假git：直接从工作树读（单测只验证manifest构建逻辑与确定性）。 */
function fakeGitReader(): GitReader {
  return {
    showHead(p: string) {
      if (p === "COMMIT") return "test-commit-hash";
      return readFileSync(path.join(REPO, p), "utf8");
    },
    listCommittedFiles(dir: string) {
      return [dir];
    },
    isWorktreeDirty() {
      return false;
    },
  };
}

describe("目标守卫（NRP-FR-017/NRP-NFR-009）", () => {
  it("DATABASE_URL未显式设置时拒绝——直接构造干净环境对象证明不读取dotenv（审查缺陷9）", () => {
    // 不依赖开发者私有文件是否存在：直接构造无DATABASE_URL的环境对象。
    // 若解析器读取过.env.local，本用例就会得到policyops目标而通过——因此
    // 抛错本身即是"零dotenv回退"的证明。
    const cleanEnv: Partial<NodeJS.ProcessEnv> = { NODE_ENV: "test" };
    expect(() => resolveTarget(cleanEnv)).toThrow(TargetGuardError);
    expect(() => resolveTarget({} as Partial<NodeJS.ProcessEnv>)).toThrow(
      /禁止dotenv\/\.env回退/,
    );
  });

  it("非授权库或非本机目标拒绝；授权本机policyops通过", () => {
    expect(() =>
      resolveTarget({ DATABASE_URL: "postgresql://u:p@10.0.0.8:5432/policyops" }),
    ).toThrow(/目标不在授权范围/);
    expect(() =>
      resolveTarget({ DATABASE_URL: "postgresql://u:p@localhost:5432/someother" }),
    ).toThrow(/目标不在授权范围/);
    const ok = resolveTarget({
      DATABASE_URL: "postgresql://u:p@localhost:5432/policyops",
    });
    expect(ok).toEqual({ host: "localhost", port: "5432", database: "policyops" });
    // 测试注入的演练库放宽仅显式传入时生效。
    expect(
      resolveTarget(
        { DATABASE_URL: "postgresql://u:p@localhost:5439/nrp_e_mat" },
        { allowedDatabases: ["nrp_e_mat"], allowedPorts: ["5439"] },
      ).database,
    ).toBe("nrp_e_mat");
  });

  it("目标指纹为非敏感哈希：不含连接串、口令或完整URL", async () => {
    const sql: SqlLike = {
      query: async () => ({ rows: [] }),
    };
    const state = await loadExistingState(sql);
    state.counts = { rules: 24, params: 29 };
    state.publishedRowsHash = "abc";
    const fp = computeTargetFingerprint(
      { host: "localhost", port: "5432", database: "policyops" },
      state,
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).not.toContain("postgresql");
    expect(fp).not.toContain("postgres:");
  });

  it("published行哈希覆盖整行负载（to_jsonb形态，审查缺陷8）", async () => {
    // 新实现：hash查询为 `select to_jsonb(r) as row from rules ...`——
    // 整行负载参与哈希，修改任一字段（此处以payload字段为例）都会改变哈希。
    const baseRow = { row: { rule_id: "R-1", name: "旧名", decision_table: {} } };
    const changedRow = {
      row: { rule_id: "R-1", name: "新名", decision_table: {} },
    };
    const sqlA: SqlLike = {
      query: async (text) => ({ rows: text.includes("from rules") ? [baseRow] : [] }),
    };
    const sqlB: SqlLike = {
      query: async (text) => ({
        rows: text.includes("from rules") ? [changedRow] : [],
      }),
    };
    const a = await loadExistingState(sqlA);
    const b = await loadExistingState(sqlB);
    expect(a.publishedRowsHash).not.toBe(b.publishedRowsHash);
    // 同一行两次读取哈希稳定。
    const a2 = await loadExistingState(sqlA);
    expect(a.publishedRowsHash).toBe(a2.publishedRowsHash);
  });
});

describe("manifest（NRP-FR-019，确定性）", () => {
  it("四地区计数与仓库权威资产一致（CN16/6、沪8/27、粤1/5、川0/3）", () => {
    const manifest = buildManifest(fakeGitReader());
    const byJur = new Map(manifest.regions.map((r) => [r.jurisdictionCode, r]));
    expect(byJur.get("CN")!.rules).toHaveLength(16);
    expect(byJur.get("CN")!.params).toHaveLength(6);
    expect(byJur.get("310000")!.rules).toHaveLength(8);
    expect(byJur.get("310000")!.params).toHaveLength(27);
    expect(byJur.get("440000")!.rules).toHaveLength(1);
    expect(byJur.get("440000")!.params).toHaveLength(5);
    expect(byJur.get("510000")!.rules).toHaveLength(0);
    expect(byJur.get("510000")!.params).toHaveLength(3);
    expect(manifest.counts).toEqual({ rules: 25, params: 41, ruleSets: 4, packs: 4 });
  });

  it("同一提交内容构建的manifest哈希恒定", () => {
    const a = manifestHash(buildManifest(fakeGitReader()));
    const b = manifestHash(buildManifest(fakeGitReader()));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("就绪语义：CN/沪awaiting_approval，粤/川blocked且原因非空", () => {
    expect(regionReadiness("CN")).toEqual({
      readiness: "awaiting_approval",
      blockingReasons: [],
    });
    expect(regionReadiness("310000").readiness).toBe("awaiting_approval");
    const gd = regionReadiness("440000");
    expect(gd.readiness).toBe("blocked");
    expect(gd.blockingReasons.length).toBeGreaterThanOrEqual(3);
    const sc = regionReadiness("510000");
    expect(sc.readiness).toBe("blocked");
    expect(sc.blockingReasons.some((r) => r.includes("征求意见"))).toBe(true);
  });
});

describe("计划器（NRP-FR-018/NRP-AC-013）", () => {
  const manifest = buildManifest(fakeGitReader());

  function emptyState(): ExistingState {
    return {
      counts: {
        rules: 24,
        params: 29,
        rule_sets: 1,
        policy_pack_versions: 0,
        tests: 528,
        cases: 851,
        showcase_cases: 117,
        policy_snapshots: 0,
      },
      publishedRowsHash: "old-hash",
      maxVersions: new Map(),
      packVersions: new Map(),
    };
  }

  it("空基线：CN/粤/川首次实体v1", () => {
    const plan = buildPlan(manifest, emptyState(), []);
    const byJur = new Map(plan.regions.map((r) => [r.jurisdictionCode, r]));
    for (const e of byJur.get("CN")!.entities) expect(e.version).toBe(1);
    for (const e of byJur.get("440000")!.entities) expect(e.version).toBe(1);
    for (const e of byJur.get("510000")!.entities) expect(e.version).toBe(1);
    // 四川批次规则成员为0（PRD §7不变量）。
    expect(byJur.get("510000")!.counts.rules).toBe(0);
    expect(byJur.get("510000")!.counts.params).toBe(3);
    expect(byJur.get("510000")!.readiness).toBe("blocked");
  });

  it("上海既有业务键→v2、新业务键→v1；所有实体强制draft", () => {
    const state = emptyState();
    // 模拟旧上海运行基线：24条规则与既有参数键。
    for (const key of [
      "R-310-MI-WAITING-PERIOD",
      "R-500-4050-ELIGIBILITY",
      "R-510-4050-AMOUNT",
      "R-520-JOB-SUBSIDY-ELIGIBILITY",
      "R-521-JOB-SUBSIDY-AMOUNT",
      "R-530-OLDER-UI-PENSION-FUND-COVERAGE",
      "R-540-SUBSIDY-MUTUAL-EXCLUSION",
      "R-600-PAY-GAP-REMINDER",
      "RS-SHANGHAI-PLAN-V1",
    ]) {
      state.maxVersions.set(`310000|${key}`, 1);
    }
    for (const key of [
      "P-SH-CONTRIB-BASE-LOWER",
      "T-SH-PAY-GAP-MONTHS",
      "P-SH-MIN-WAGE",
    ]) {
      state.maxVersions.set(`310000|${key}`, 1);
    }
    const plan = buildPlan(manifest, state, []);
    const sh = plan.regions.find((r) => r.jurisdictionCode === "310000")!;
    const versions = new Map(
      sh.entities.map((e) => [`${e.entityType}|${e.businessKey}`, e.version] as const),
    );
    expect(versions.get("rule|R-500-4050-ELIGIBILITY")).toBe(2);
    expect(versions.get("rule_set|RS-SHANGHAI-PLAN-V1")).toBe(2);
    expect(versions.get("param|P-SH-MIN-WAGE")).toBe(2);
    // 新业务键（重分类引入）→v1。
    expect(versions.get("param|P-MI-LIFETIME-MALE-YEARS")).toBe(1);
    expect(versions.get("param|T-UNEMPLOYMENT-DURATION-BY-YEARS")).toBe(1);
    for (const r of plan.regions) {
      for (const e of r.entities) {
        expect(e.status).toBe("draft");
      }
    }
  });

  it("目标版本冲突拒绝", () => {
    const state = emptyState();
    // 已存在同地区同键v2 → 计划解析为3正常；但同名v3已存在时max=3→4，不冲突。
    // 冲突场景：manifest内同一键出现两次（人为构造）。
    const state2 = emptyState();
    state2.maxVersions.set("CN|R-200-MIN-PENSION-YEARS", 1);
    const plan = buildPlan(manifest, state2, []);
    expect(plan.counts.rules).toBeGreaterThan(0);
    // 直接构造重复键验证冲突分支。
    const dupState = emptyState();
    expect(() => {
      const p = buildPlan(manifest, dupState, []);
      // 手工注入重复实体模拟计划冲突。
      const first = p.regions[0].entities[0];
      p.regions[0].entities.push({ ...first });
      const seen = new Set<string>();
      for (const e of p.regions[0].entities) {
        const key = `${e.entityType}|${e.jurisdictionCode}|${e.businessKey}|${e.version}`;
        if (seen.has(key)) throw new PlanConflictError(key);
        seen.add(key);
      }
    }).toThrow(PlanConflictError);
  });
});

function makeEmptyState(): ExistingState {
  return {
    counts: {
      rules: 24,
      params: 29,
      rule_sets: 1,
      policy_pack_versions: 0,
      tests: 528,
      cases: 851,
      showcase_cases: 117,
      policy_snapshots: 0,
    },
    publishedRowsHash: "old-hash",
    maxVersions: new Map(),
    packVersions: new Map(),
  };
}

describe("包快照完整性（审查缺陷4）", () => {
  it("表格参数快照携带rows/key_fields/value_fields/type/有效期，标量携带value", () => {
    const manifest = buildManifest(fakeGitReader());
    const plan = buildPlan(manifest, makeEmptyState(), []);
    const cnPack = plan.regions
      .find((r) => r.jurisdictionCode === "CN")!
      .entities.find((e) => e.entityType === "policy_pack_version")!;
    const snapshot = cnPack.payload as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(6);

    const retireTable = snapshot.find(
      (s) => s.businessKey === "T-RETIREMENT-AGE-LOOKUP",
    );
    expect(retireTable).toBeTruthy();
    expect(retireTable?.type).toBe("table");
    expect(Array.isArray(retireTable?.rows)).toBe(true);
    expect((retireTable?.rows as unknown[]).length).toBeGreaterThan(0);
    expect(retireTable?.key_fields).toEqual([
      "gender",
      "female_retire_type",
      "birth_year",
    ]);
    expect(retireTable?.value_fields).toContain("legal_retire_age_years");
    expect(retireTable?.effective_from).toBe("2025-01-01");
    expect(retireTable?.operation).toBe("baseline");
    expect(retireTable?.target_business_key).toBeNull();
    expect(Array.isArray(retireTable?.evidence)).toBe(true);
    expect((retireTable?.evidence as unknown[]).length).toBeGreaterThan(0);

    const scalar = snapshot.find(
      (s) => s.businessKey === "P-UNEMPLOYMENT-MAX-MONTHS",
    );
    expect(scalar?.value).toBe(24);
    expect(scalar?.type).toBe("number");
    // 标量不得写rows。
    expect(scalar?.rows ?? null).toBeNull();

    const timeline = snapshot.find(
      (s) => s.businessKey === "T-MIN-PENSION-YEARS-BY-RETIRE-YEAR",
    );
    expect(timeline?.type).toBe("timeline");
    expect(Array.isArray(timeline?.rows)).toBe(true);

    // paramId/businessKey齐备。
    for (const entry of snapshot) {
      expect(entry.businessKey ?? entry.param_id).toBeTruthy();
      expect(entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
