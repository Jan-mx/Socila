/**
 * Socila命名契约扫描（09-05 SDL-FR-006/007/008/009、SDL-AC-003）。
 *
 * 语义（2026-09-05复审纠正）：允许的"精确旧协议值"只在migration与migration行为测试中
 * 允许枚举；扫描逻辑把"允许的精确旧协议值"与"独立品牌缩写"区分开——宽泛品牌检查
 * 不得命中已允许的精确片段，但同一文件中出现其他独立品牌标识仍必须失败。
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_FRAGMENT_FILES,
  FORBIDDEN_TOKENS,
  LEGACY_BRAND_SUBSTRING,
  LEGACY_DSL_DIR_ID_FRAGMENT,
  LEGACY_DSL_DIR_ID_PATTERN,
  LEGACY_DSL_VERSION_FRAGMENT,
  LEGACY_DSL_VERSION_PATTERN,
  allowedFragmentsFor,
  listActiveFiles,
  scanActiveFiles,
  scanContent,
} from "./socila-naming-contract";

const ssrpSample = ["SS", "RP"].join("");

describe("精确旧协议值与独立品牌标识的区分（复审纠正）", () => {
  const migrationLikeContent =
    "WHERE dsl_version IN ('SSP-DSL-1.0', 'ssp_dsl_v1', 'SOCILA-DSL-1.0');";
  const fragments = [LEGACY_DSL_VERSION_FRAGMENT, LEGACY_DSL_DIR_ID_FRAGMENT];

  it("migration内容在允许片段下零命中（SDL-FR-011允许枚举旧值）", () => {
    expect(scanContent(migrationLikeContent, fragments)).toEqual([]);
  });

  it("相同内容无允许片段时命中（宽泛品牌+精确协议值都被捕获）", () => {
    const hits = scanContent(migrationLikeContent, []);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it(`允许片段文件中出现其他独立${LEGACY_BRAND_SUBSTRING}品牌标识仍必须失败`, () => {
    const withIndependentBrand = `${migrationLikeContent}\nconst banner = "${LEGACY_BRAND_SUBSTRING} Web 平台";`;
    const hits = scanContent(withIndependentBrand, fragments);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/独立品牌/);
  });

  it(`允许片段文件中出现独立${ssrpSample}品牌标识仍必须失败`, () => {
    const withIndependentSsrp = `${migrationLikeContent}\n// ${ssrpSample} legacy platform`;
    const hits = scanContent(withIndependentSsrp, fragments);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/独立品牌/);
  });

  it("允许片段清单只覆盖migration与migration行为测试", () => {
    expect(ALLOWED_FRAGMENT_FILES.map((e) => e.file.source)).toEqual(
      expect.arrayContaining([/^drizzle\/0010_.*\.sql$/.source]),
    );
    expect(allowedFragmentsFor("src/lib/db/seed/index.ts")).toEqual([]);
    expect(allowedFragmentsFor("drizzle/0010_sdl_dsl_normalization_example_cleanup.sql"))
      .toEqual(fragments);
  });

  it("导出的协议片段与宽泛品牌值经拆分构造且模式可用", () => {
    expect(LEGACY_DSL_VERSION_FRAGMENT).toBe("SSP-DSL-1.0");
    expect(LEGACY_DSL_DIR_ID_FRAGMENT).toBe("ssp_dsl_v1");
    expect(LEGACY_DSL_VERSION_PATTERN.test("dsl_version: 'SSP-DSL-1.0'")).toBe(true);
    expect(LEGACY_DSL_DIR_ID_PATTERN.test("dsl/ssp_dsl_v1/rules")).toBe(true);
    expect(new RegExp(LEGACY_BRAND_SUBSTRING).test(`${LEGACY_BRAND_SUBSTRING} Web`)).toBe(true);
  });

  it("禁用token清单包含精确协议值与宽泛品牌两类", () => {
    const names = FORBIDDEN_TOKENS.map((t) => t.name);
    expect(names.some((n) => n.includes(LEGACY_DSL_VERSION_FRAGMENT))).toBe(true);
    expect(names.filter((n) => n.includes("独立品牌"))).toHaveLength(2);
  });
});

describe("Socila命名契约（SDL-AC-003：活动路径无遗留品牌缩写运行标识）", () => {
  it("活动代码与配置零遗留标识命中", () => {
    const findings = scanActiveFiles();
    expect(findings).toEqual([]);
  });

  it("扫描范围覆盖活动根且排除历史文档与package-lock", () => {
    const files = listActiveFiles();
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.startsWith("docs/"))).toBe(false);
    expect(files).not.toContain("package-lock.json");
  });
});
