/**
 * SHV2-FR-016 / SHV2-AC-013 Markdown案例库：确定性渲染、manifest自校验、--check漂移检测。
 *
 * - renderCaseLibraryMarkdown：36条完整案例（UID/地区/能力/as-of/画像/问题/结论/input摘要/
 *   expected摘要/assertions/snapshot ID与hash/政策标题/发布机关/官方URL/条款定位/原文摘录）；
 * - buildCaseLibraryManifest：manifestHash由正文确定性计算（不含时间戳）；
 * - checkCaseLibraryMarkdown：md逐字节≠重渲染、任一案例contentHash不一致、manifestHash
 *   不一致、计数≠36/18/18 → ok=false（手工修改必须失败）；
 * - 仓库已提交的 `docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.md` 与
 *   `.manifest.json` 必须通过check，且其场景内容与内存生成器逐条一致（快照绑定除外）。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildCaseLibraryManifest,
  checkCaseLibraryMarkdown,
  recomputeCaseLibraryManifestHash,
  renderCaseLibraryMarkdown,
  CASE_LIBRARY_DOC_PATH,
  CASE_LIBRARY_MANIFEST_PATH,
  type CaseLibraryManifestV2,
} from "../case-library-doc";
import { generateShowcaseScenariosV2, type GeneratedScenarioV2 } from "../generator-v2";
import { computeExpectedInMemory } from "./engine-chain-v2";

const REPO_ROOT = process.cwd();

async function freshManifest(): Promise<CaseLibraryManifestV2> {
  const scenarios = await generateShowcaseScenariosV2(computeExpectedInMemory);
  return buildCaseLibraryManifest(scenarios);
}

describe("SHV2-FR-016 Markdown案例库渲染", () => {
  it("渲染36条完整案例，每条包含全部必备字段小节", async () => {
    const manifest = await freshManifest();
    const md = renderCaseLibraryMarkdown(manifest);
    expect(md.length).toBeGreaterThan(20_000);
    for (const s of manifest.scenarios) {
      expect(md).toContain(s.caseUid);
      expect(md).toContain(s.testUid);
      expect(md).toContain(s.userMessage);
      expect(md).toContain(s.snapshotContentHash);
      expect(md).toContain(s.snapshotId);
      expect(md).toContain(s.contentHash);
      for (const p of s.policySources) {
        expect(md).toContain(p.title);
        expect(md).toContain(p.authority);
        expect(md).toContain(p.officialUrl);
        expect(md).toContain(p.locator.reference);
        expect(md).toContain(p.excerpt);
      }
    }
    for (const label of [
      "地区",
      "能力",
      "as-of",
      "合成人物画像",
      "咨询问题",
      "规则引擎结论",
      "input摘要",
      "expected摘要",
      "assertions",
      "snapshot",
      "政策标题",
      "发布机关",
      "官方URL",
      "条款定位",
      "原文摘录",
    ]) {
      expect(md, label).toContain(label);
    }
    // 36个案例标题小节（### 级）。
    const sections = md.match(/^### /gm) ?? [];
    expect(sections.length).toBeGreaterThanOrEqual(36);
    expect(md).toContain("合成政策案例");
    expect(md).not.toMatch(/真实咨询|真实社保规划案例|真实咨询样本/);
  });

  it("渲染与manifest均确定性：两次生成逐字节一致，manifestHash不含时间戳", async () => {
    const m1 = await freshManifest();
    const m2 = await freshManifest();
    expect(JSON.stringify(m2)).toBe(JSON.stringify(m1));
    expect(renderCaseLibraryMarkdown(m2)).toBe(renderCaseLibraryMarkdown(m1));
    expect(m1.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(recomputeCaseLibraryManifestHash(m1)).toBe(m1.manifestHash);
    expect(m1).not.toHaveProperty("createdAt");
    expect(m1).not.toHaveProperty("generatedAt");
    expect(m1.caseCount).toBe(36);
    expect(m1.shanghaiCount).toBe(18);
    expect(m1.guangdongCount).toBe(18);
  });
});

describe("SHV2-AC-013 --check 漂移检测", () => {
  it("新鲜渲染通过check", async () => {
    const manifest = await freshManifest();
    const md = renderCaseLibraryMarkdown(manifest);
    const result = checkCaseLibraryMarkdown({ markdown: md, manifest });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("手工修改Markdown任一字符 → check失败", async () => {
    const manifest = await freshManifest();
    const md = renderCaseLibraryMarkdown(manifest);
    const tampered = md.replace(/2340/, "2350");
    expect(tampered).not.toBe(md);
    const result = checkCaseLibraryMarkdown({ markdown: tampered, manifest });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => /Markdown|逐字节|重渲染/.test(p))).toBe(true);
  });

  it("修改manifest中案例内容而不更新contentHash → check失败", async () => {
    const manifest = await freshManifest();
    const md = renderCaseLibraryMarkdown(manifest);
    const forged = structuredClone(manifest) as CaseLibraryManifestV2;
    forged.scenarios[0] = { ...forged.scenarios[0], aiResponse: forged.scenarios[0].aiResponse + " " };
    const result = checkCaseLibraryMarkdown({ markdown: md, manifest: forged });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => /contentHash/.test(p))).toBe(true);
  });

  it("篡改manifestHash或案例数量 → check失败", async () => {
    const manifest = await freshManifest();
    const md = renderCaseLibraryMarkdown(manifest);
    const badHash = { ...manifest, manifestHash: "0".repeat(64) } as CaseLibraryManifestV2;
    expect(checkCaseLibraryMarkdown({ markdown: md, manifest: badHash }).ok).toBe(false);
    const dropped = structuredClone(manifest) as CaseLibraryManifestV2;
    dropped.scenarios = dropped.scenarios.slice(1);
    const result = checkCaseLibraryMarkdown({
      markdown: renderCaseLibraryMarkdown(dropped),
      manifest: dropped,
    });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => /36|计数/.test(p))).toBe(true);
  });
});

describe("仓库已提交案例库文档（SHV2-AC-013）", () => {
  const mdPath = path.join(REPO_ROOT, CASE_LIBRARY_DOC_PATH);
  const manifestPath = path.join(REPO_ROOT, CASE_LIBRARY_MANIFEST_PATH);

  it("docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.md 与manifest存在并通过check", () => {
    expect(CASE_LIBRARY_DOC_PATH).toBe("docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.md");
    expect(existsSync(mdPath), "案例库Markdown缺失").toBe(true);
    expect(existsSync(manifestPath), "案例库manifest缺失").toBe(true);
    const markdown = readFileSync(mdPath, "utf8");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CaseLibraryManifestV2;
    const result = checkCaseLibraryMarkdown({ markdown, manifest });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(manifest.generatorVersion).toBe("RCL-GEN-2.0");
  });

  it("已提交manifest的36条场景内容与内存生成器逐条一致（快照绑定与contentHash除外）", async () => {
    const committed = JSON.parse(readFileSync(manifestPath, "utf8")) as CaseLibraryManifestV2;
    const fresh = await generateShowcaseScenariosV2(computeExpectedInMemory);
    expect(committed.scenarios.map((s) => s.caseUid)).toEqual(fresh.map((s) => s.caseUid));
    const strip = (s: GeneratedScenarioV2) => {
      const { snapshotId: _a, snapshotContentHash: _b, contentHash: _c, ...rest } = s;
      void _a;
      void _b;
      void _c;
      return rest;
    };
    for (let i = 0; i < fresh.length; i++) {
      expect(strip(committed.scenarios[i]), fresh[i].scenarioKey).toEqual(strip(fresh[i]));
    }
  });
});
