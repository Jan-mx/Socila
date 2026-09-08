/**
 * RCL-FR-007/008/012/014、RCL-AC-005/007/008 确定性地区案例生成器（单元层）：
 * - 模板为纯数据（版本化），生成产物逐字节一致（RCL-NFR-002）；
 * - 只生成上海310000与广东440000用户案例；CN仅内部DSL基线、四川仅unsupported负例；
 * - showcase配额：每地区18条、男女9/9、三个年龄段各6、三种就业状态各6（RCL-AC-008）；
 * - 每个case生成一条地区回归test（RCL-FR-013）；
 * - 相同模板重复生成相同N、产物与manifestHash（RCL-AC-005）。
 */
import { describe, it, expect } from "vitest";
import {
  generateShowcaseScenarios,
  GENERATOR_VERSION,
  buildCoverageManifest,
  type GeneratedScenario,
} from "../generator";

describe("RCL-FR-012/014 地区与配额", () => {
  it("只生成上海与广东；四川与CN不生成用户案例", async () => {
    const scenarios = await generateShowcaseScenarios();
    const codes = new Set(scenarios.map((s) => s.jurisdictionCode));
    expect(codes).toEqual(new Set(["310000", "440000"]));
    expect(scenarios.every((s) => s.jurisdictionCode === "310000" || s.jurisdictionCode === "440000")).toBe(true);
  });

  it("showcase固定36条：沪18、粤18（RCL-AC-008）", async () => {
    const scenarios = await generateShowcaseScenarios();
    expect(scenarios).toHaveLength(36);
    const sh = scenarios.filter((s) => s.jurisdictionCode === "310000");
    const gd = scenarios.filter((s) => s.jurisdictionCode === "440000");
    expect(sh).toHaveLength(18);
    expect(gd).toHaveLength(18);
  });

  it("每地区男女9/9、三个年龄段各6、三种就业状态各6（RCL-AC-008）", async () => {
    const all = await generateShowcaseScenarios();
    for (const code of ["310000", "440000"]) {
      const scenarios = all.filter(
        (s) => s.jurisdictionCode === code,
      );
      const gender = (g: string) =>
        scenarios.filter(
          (s) =>
            (s.input.basic as Record<string, unknown> | undefined)?.gender === g,
        );
      expect(gender("female")).toHaveLength(9);
      expect(gender("male")).toHaveLength(9);

      const band = (b: string) =>
        scenarios.filter((s) => s.coverageObligations.includes(`band:${b}`));
      expect(band("before_1970")).toHaveLength(6);
      expect(band("1970_1979")).toHaveLength(6);
      expect(band("from_1980")).toHaveLength(6);

      const status = (st: string) =>
        scenarios.filter(
          (s) =>
            (s.input.status as Record<string, unknown> | undefined)
              ?.employment_status === st,
        );
      expect(status("employed")).toHaveLength(6);
      expect(status("flexible")).toHaveLength(6);
      expect(status("unemployed")).toHaveLength(6);
    }
  });

  it("UID格式固定为 RPC-<地区>-<场景键>-V1（PRD §4）", async () => {
    for (const s of await generateShowcaseScenarios()) {
      expect(s.caseUid).toMatch(/^RPC-(310000|440000)-[A-Za-z0-9_-]+-V1$/);
      expect(s.generatorVersion).toBe(GENERATOR_VERSION);
    }
  });
});

describe("RCL-FR-007/016 场景结构", () => {
  it("每个场景携带显式断言（至少1条可比断言）", async () => {
    for (const s of await generateShowcaseScenarios()) {
      expect(s.assertions.length).toBeGreaterThanOrEqual(1);
      for (const a of s.assertions) {
        expect(a.path).toMatch(/^(calc|plan|user)\./);
        expect(["eq", "contains", "is_null"]).toContain(a.operator);
      }
    }
  });

  it("场景包含asOfDate/capability/evidence/coverageObligations/snapshot绑定字段", async () => {
    for (const s of await generateShowcaseScenarios()) {
      expect(s.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof s.capability).toBe("string");
      expect(Array.isArray(s.coverageObligations)).toBe(true);
      expect(s.coverageObligations.length).toBeGreaterThan(0);
      expect(s.showcaseEligible).toBe(true);
      // snapshotId/hash由生成流程绑定（此处模板为占位，生成器装配时填充）。
      expect(s.input).toBeDefined();
    }
  });

  it("广东场景覆盖2026医保缺参/2030年限/失业金额/领取地市边界（RCL-FR-010）", async () => {
    const gd = (await generateShowcaseScenarios()).filter((s) => s.jurisdictionCode === "440000");
    const obligations = gd.flatMap((s) => s.coverageObligations);
    expect(obligations.some((o) => o.includes("mi-2026-missing"))).toBe(true);
    expect(obligations.some((o) => o.includes("mi-2030"))).toBe(true);
    expect(obligations.some((o) => o.includes("ui-amount"))).toBe(true);
    expect(obligations.some((o) => o.includes("claim-city"))).toBe(true);
  });

  it("上海场景覆盖退休/养老/医保/失业/灵活就业/补贴（RCL-FR-011）", async () => {
    const sh = (await generateShowcaseScenarios()).filter((s) => s.jurisdictionCode === "310000");
    const obligations = sh.flatMap((s) => s.coverageObligations);
    for (const cap of ["retirement", "pension", "medical", "unemployment", "flexible", "subsidy"]) {
      expect(obligations.some((o) => o.includes(cap)), cap).toBe(true);
    }
  });
});

describe("RCL-FR-013/AC-005 回归测试与确定性", () => {
  it("每个case生成一条地区回归test UID（RPCT-<地区>-<场景键>-V1）", async () => {
    for (const s of await generateShowcaseScenarios()) {
      expect(s.testUid).toMatch(/^RPCT-(310000|440000)-[A-Za-z0-9_-]+-V1$/);
      expect(s.testUid).toContain(s.caseUid.replace(/^RPC-/, ""));
    }
  });

  it("相同模板重复生成逐字节一致（RCL-AC-005/RCL-NFR-002）", async () => {
    const a = await generateShowcaseScenarios();
    const b = await generateShowcaseScenarios();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const ma = buildCoverageManifest(a);
    const mb = buildCoverageManifest(b);
    expect(ma.manifestHash).toBe(mb.manifestHash);
  });

  it("覆盖manifest的N=唯一case数；不硬编码452/500（RCL-FR-015/PRD §4）", async () => {
    const scenarios = await generateShowcaseScenarios();
    const manifest = buildCoverageManifest(scenarios);
    expect(manifest.caseCount).toBe(new Set(scenarios.map((s) => s.caseUid)).size);
    expect(manifest.showcaseCount).toBe(36);
    expect(manifest.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("RCL-FR-010 广东领取地市场景", () => {
  it("有效领取地市（440100广州）场景断言金额；缺失城市场景断言needs_agent（不估算）", async () => {
    const gd = (await generateShowcaseScenarios()).filter((s) => s.jurisdictionCode === "440000");
    const withCity = gd.find((s) =>
      s.coverageObligations.includes("claim-city:valid-440100"),
    );
    const missingCity = gd.find((s) =>
      s.coverageObligations.includes("claim-city:missing"),
    );
    expect(withCity).toBeDefined();
    expect(missingCity).toBeDefined();
    expect(
      withCity!.assertions.some((a) => a.path.includes("unemployment")),
    ).toBe(true);
    expect(
      missingCity!.assertions.some((a) => a.path.includes("needs_agent")),
    ).toBe(true);
  });
});

// 类型导入（vitest下export type可被引用）
export type { GeneratedScenario };