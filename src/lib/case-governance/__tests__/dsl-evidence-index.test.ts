/**
 * WI-20260914-01：policySources排序的平台确定性契约（SHV2-FR-013/AC-011）。
 *
 * CI #24 gates真实失败：`case-library-doc.test.ts`对`SH-male-before_1970-employed-RETIREMENT`
 * 报"已提交manifest与内存生成器不一致"——差异仅为同一文档两条来源
 * （`附件1-3 延迟法定退休年龄对照表` vs `国务院办法第一条`）的顺序互换。
 * 根因：`dsl-evidence-index.ts`的`sources.sort`使用无locale参数的`localeCompare`，
 * 中文文本的比较结果依赖宿主默认locale（Windows zh-CN collation与Linux runner
 * root/en collation不同），导致生成产物跨平台非确定。
 *
 * 契约：来源排序必须是平台无关的UTF-16 code-unit元组序（documentId → locator.reference
 * → excerpt），任何宿主locale下同一输入得到同一顺序。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePolicySources } from "../dsl-evidence-index";
import type { PolicySource } from "@/lib/showcase/case-nature";

/** 平台无关比较器：UTF-16 code unit顺序。 */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sortKeyOf = (p: PolicySource) => {
  const doc = p.documentId;
  const ref = p.locator.reference;
  const exc = p.excerpt;
  return {
    cmp(other: PolicySource): number {
      if (doc !== other.documentId) return byCodeUnit(doc, other.documentId);
      if (ref !== other.locator.reference) return byCodeUnit(ref, other.locator.reference);
      return byCodeUnit(exc, other.excerpt);
    },
  };
};

const manifestPath = fileURLToPath(
  new URL("../../../../docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.manifest.json", import.meta.url),
);

interface ManifestScenario {
  scenarioKey: string;
  jurisdictionCode: string;
  asOfDate: string;
  assertions: Array<{ path: string }>;
  policySources: Array<{ documentId: string; locator: { reference: string } }>;
}

describe("resolvePolicySources排序平台确定性（WI-20260914-01）", () => {
  const committed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    scenarios: ManifestScenario[];
  };

  it("全部36场景的policySources顺序等于code-unit元组序（与宿主locale无关）", () => {
    expect(committed.scenarios).toHaveLength(36);
    for (const scenario of committed.scenarios) {
      const sources = resolvePolicySources({
        jurisdictionCode: scenario.jurisdictionCode,
        asOfDate: scenario.asOfDate,
        assertedPaths: scenario.assertions.map((a) => a.path),
      });
      expect(sources.length, scenario.scenarioKey).toBeGreaterThan(0);
      for (let i = 1; i < sources.length; i += 1) {
        const cmp = sortKeyOf(sources[i - 1]).cmp(sources[i]);
        expect(cmp, `${scenario.scenarioKey}#${i} 顺序必须为code-unit元组序`).toBeLessThanOrEqual(0);
      }
    }
  });

  it("已知反例场景（延迟退休）：同文档'国务院办法第一条'(U+56FD)排在'附件1-3'(U+9644)之前", () => {
    const sources = resolvePolicySources({
      jurisdictionCode: "310000",
      asOfDate: "2026-09-01",
      assertedPaths: [
        "calc.retirement.legal_retire_age_years",
        "calc.retirement.legal_retire_age_months",
        "calc.retirement.legal_retire_date",
      ],
    });
    const refs = sources
      .filter((p) => p.documentId === "DOC-CN-NPC-DELAYED-RETIREMENT-2024")
      .map((p) => p.locator.reference);
    expect(refs).toContain("国务院办法第一条");
    expect(refs).toContain("附件1-3 延迟法定退休年龄对照表");
    expect(
      refs.indexOf("国务院办法第一条"),
      `实际顺序：${refs.join(" | ")}`,
    ).toBeLessThan(refs.indexOf("附件1-3 延迟法定退休年龄对照表"));
  });
});
