/**
 * SHV2-FR-016 / SHV2-AC-013 Markdown案例库：确定性渲染 + manifest自校验 + --check。
 *
 * - manifest正文 = 36条GeneratedScenarioV2（生成顺序）+ 快照绑定 + 计数 + coverage hash；
 *   manifestHash 由除自身外的全部正文规范化计算，不含任何时间戳；
 * - Markdown由manifest确定性渲染（相同manifest逐字节相同）；
 * - check：manifestHash重算、逐案例contentHash重算、36/18/18计数、UID唯一、生成器版本、
 *   Markdown逐字节等于重渲染（换行符规范化为LF后比较）——任一不一致 ok=false。
 */
import { createHash } from "node:crypto";
import { canonicalJson } from "./hashes";
import {
  GENERATOR_VERSION_V2,
  buildCoverageManifestV2,
  recomputeScenarioContentHashV2,
  type GeneratedScenarioV2,
} from "./generator-v2";
import { describePersona } from "./case-content-v2";
import { SYNTHETIC_CASE_LABEL, SYNTHETIC_DISCLAIMER, capabilityLabel, regionLabel } from "@/lib/showcase/labels";

export const CASE_LIBRARY_DOC_PATH = "docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.md";
export const CASE_LIBRARY_MANIFEST_PATH =
  "docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.manifest.json";
export const CASE_LIBRARY_DOC_VERSION = "CASE-LIBRARY-DOC-1.0";

export interface SnapshotBinding {
  jurisdictionCode: string;
  asOfDate: string;
  snapshotId: string;
  snapshotContentHash: string;
}

export interface CaseLibraryManifestV2 {
  docVersion: string;
  generatorVersion: string;
  caseCount: number;
  shanghaiCount: number;
  guangdongCount: number;
  snapshotBindings: SnapshotBinding[];
  coverageManifestHash: string;
  scenarios: GeneratedScenarioV2[];
  manifestHash: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function coreOf(m: Omit<CaseLibraryManifestV2, "manifestHash"> & { manifestHash?: string }) {
  return {
    docVersion: m.docVersion,
    generatorVersion: m.generatorVersion,
    caseCount: m.caseCount,
    shanghaiCount: m.shanghaiCount,
    guangdongCount: m.guangdongCount,
    snapshotBindings: m.snapshotBindings,
    coverageManifestHash: m.coverageManifestHash,
    scenarios: m.scenarios,
  };
}

export function recomputeCaseLibraryManifestHash(m: CaseLibraryManifestV2): string {
  return sha256(canonicalJson(coreOf(m)));
}

/** 由生成结果构建manifest（生成顺序保留；无时间戳）。 */
export function buildCaseLibraryManifest(scenarios: GeneratedScenarioV2[]): CaseLibraryManifestV2 {
  const bindingsMap = new Map<string, SnapshotBinding>();
  for (const s of scenarios) {
    const key = `${s.jurisdictionCode}|${s.asOfDate}`;
    const existing = bindingsMap.get(key);
    if (existing && (existing.snapshotId !== s.snapshotId || existing.snapshotContentHash !== s.snapshotContentHash)) {
      throw new Error(`同一地区/as-of的快照绑定不一致：${key}`);
    }
    bindingsMap.set(key, {
      jurisdictionCode: s.jurisdictionCode,
      asOfDate: s.asOfDate,
      snapshotId: s.snapshotId,
      snapshotContentHash: s.snapshotContentHash,
    });
  }
  const snapshotBindings = [...bindingsMap.values()].sort((a, b) =>
    `${a.jurisdictionCode}|${a.asOfDate}`.localeCompare(`${b.jurisdictionCode}|${b.asOfDate}`),
  );
  const coverage = buildCoverageManifestV2(scenarios);
  const body = {
    docVersion: CASE_LIBRARY_DOC_VERSION,
    generatorVersion: GENERATOR_VERSION_V2,
    caseCount: coverage.caseCount,
    shanghaiCount: coverage.shanghaiCount,
    guangdongCount: coverage.guangdongCount,
    snapshotBindings,
    coverageManifestHash: coverage.manifestHash,
    scenarios,
  };
  return { ...body, manifestHash: sha256(canonicalJson(body)) };
}

// ─── 渲染 ───────────────────────────────────────────────────────────────────

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), null, 2);
}

function fence(lang: string, body: string): string[] {
  return ["```" + lang, body, "```"];
}

function mdEscapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function renderScenario(s: GeneratedScenarioV2, index: number): string[] {
  const lines: string[] = [];
  lines.push(`### ${index + 1}. ${s.title}`);
  lines.push("");
  lines.push(`- UID：\`${s.caseUid}\`（回归测试UID：\`${s.testUid}\`）`);
  lines.push(`- 地区：${regionLabel(s.jurisdictionCode)}（${s.jurisdictionCode}）`);
  lines.push(`- 能力：${capabilityLabel(s.capability)}（\`${s.capability}\`）`);
  lines.push(`- as-of日期：${s.asOfDate}`);
  lines.push(`- 生成器版本：${s.generatorVersion}`);
  lines.push(`- snapshot ID：\`${s.snapshotId}\``);
  lines.push(`- snapshot hash：\`${s.snapshotContentHash}\``);
  lines.push(`- 案例content hash：\`${s.contentHash}\``);
  lines.push(
    `- quality：总分${s.quality.total}（输入完整${s.quality.inputCompleteness}/覆盖义务${s.quality.coverageObligations}/断言重放${s.quality.snapshotReplay}）`,
  );
  lines.push(`- 结论级别：${s.expected.needs_agent === true ? "需人工补充确认（needs_agent）" : "确定性结论"}`);
  lines.push(`- category：${s.category}；topics：${s.topics.join("、")}`);
  lines.push(`- tags：${s.tags.map((t) => `\`${t}\``).join(" ")}`);
  lines.push("");
  lines.push("**合成人物画像**");
  lines.push("");
  for (const p of describePersona(s)) lines.push(`- ${p}`);
  lines.push("");
  lines.push("**咨询问题**");
  lines.push("");
  lines.push(`> ${s.userMessage}`);
  lines.push("");
  lines.push("**规则引擎结论（公开回答）**");
  lines.push("");
  lines.push(...fence("text", s.aiResponse));
  lines.push("");
  lines.push("**input摘要**");
  lines.push("");
  lines.push(...fence("json", prettyJson(s.input)));
  lines.push("");
  lines.push("**expected摘要**");
  lines.push("");
  lines.push(...fence("json", prettyJson(s.expected)));
  lines.push("");
  lines.push("**assertions**");
  lines.push("");
  lines.push("| 路径 | 操作 | 期望值 |");
  lines.push("| --- | --- | --- |");
  for (const a of s.assertions) {
    lines.push(`| \`${a.path}\` | ${a.operator} | \`${mdEscapeCell(JSON.stringify(a.value))}\` |`);
  }
  lines.push("");
  lines.push("**政策依据**");
  lines.push("");
  s.policySources.forEach((p, i) => {
    lines.push(`${i + 1}. 政策标题：《${p.title}》`);
    lines.push(`   - 文档ID：\`${p.documentId}\``);
    lines.push(`   - 发布机关：${p.authority}`);
    lines.push(`   - 官方URL：<${p.officialUrl}>`);
    lines.push(`   - 条款定位：${p.locator.type} / ${p.locator.reference}`);
    lines.push(`   - 原文摘录：${p.excerpt}`);
    lines.push(`   - 原件SHA-256：\`${p.contentSha256}\``);
  });
  lines.push("");
  return lines;
}

/** 确定性渲染Markdown（LF换行）。 */
export function renderCaseLibraryMarkdown(m: CaseLibraryManifestV2): string {
  const lines: string[] = [];
  lines.push(`# 上海与广东${SYNTHETIC_CASE_LABEL}库 V2（${m.generatorVersion}）`);
  lines.push("");
  lines.push("> Author: Jan");
  lines.push("> Status: Generated");
  lines.push(`> 文档版本：${m.docVersion}；manifestHash：\`${m.manifestHash}\`；coverageManifestHash：\`${m.coverageManifestHash}\``);
  lines.push("");
  lines.push(
    `本文档由 \`scripts/rcl-case-library-v2-doc.ts\` 从 \`${CASE_LIBRARY_MANIFEST_PATH.split("/").pop()}\` 确定性渲染；手工修改本文档或manifest任一字节都会使 \`--check\` 失败。全部案例为${SYNTHETIC_CASE_LABEL}：人物为合成画像、不含任何真实个人数据；数值、资格与日期全部来自规则引擎在对应快照上的计算结果；${SYNTHETIC_DISCLAIMER}。`,
  );
  lines.push("");
  lines.push("## 概览");
  lines.push("");
  lines.push("| 项目 | 值 |");
  lines.push("| --- | --- |");
  lines.push(`| 案例总数 | ${m.caseCount} |`);
  lines.push(`| 上海（310000） | ${m.shanghaiCount} |`);
  lines.push(`| 广东（440000） | ${m.guangdongCount} |`);
  lines.push(`| 生成器版本 | ${m.generatorVersion} |`);
  lines.push("");
  lines.push("## 快照绑定");
  lines.push("");
  lines.push("| 地区 | as-of | snapshot ID | snapshot hash |");
  lines.push("| --- | --- | --- | --- |");
  for (const b of m.snapshotBindings) {
    lines.push(`| ${regionLabel(b.jurisdictionCode)}（${b.jurisdictionCode}） | ${b.asOfDate} | \`${b.snapshotId}\` | \`${b.snapshotContentHash}\` |`);
  }
  lines.push("");
  lines.push("## 案例索引");
  lines.push("");
  lines.push("| # | UID | 地区 | 能力 | as-of | 结论级别 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  m.scenarios.forEach((s, i) => {
    lines.push(
      `| ${i + 1} | \`${s.caseUid}\` | ${regionLabel(s.jurisdictionCode)} | ${capabilityLabel(s.capability)}（${s.capability}） | ${s.asOfDate} | ${s.expected.needs_agent === true ? "needs_agent" : "确定"} |`,
    );
  });
  lines.push("");
  lines.push("## 案例明细");
  lines.push("");
  m.scenarios.forEach((s, i) => lines.push(...renderScenario(s, i)));
  return lines.join("\n") + "\n";
}

// ─── check ─────────────────────────────────────────────────────────────────

export interface CaseLibraryCheckResult {
  ok: boolean;
  problems: string[];
}

function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** --check：manifest自校验 + 逐案例contentHash + 计数 + Markdown逐字节对账。 */
export function checkCaseLibraryMarkdown(input: {
  markdown: string;
  manifest: CaseLibraryManifestV2;
}): CaseLibraryCheckResult {
  const problems: string[] = [];
  const m = input.manifest;
  if (m.generatorVersion !== GENERATOR_VERSION_V2) {
    problems.push(`生成器版本 ${m.generatorVersion} ≠ ${GENERATOR_VERSION_V2}`);
  }
  if (m.docVersion !== CASE_LIBRARY_DOC_VERSION) {
    problems.push(`文档版本 ${m.docVersion} ≠ ${CASE_LIBRARY_DOC_VERSION}`);
  }
  const scenarios = Array.isArray(m.scenarios) ? m.scenarios : [];
  const sh = scenarios.filter((s) => s.jurisdictionCode === "310000").length;
  const gd = scenarios.filter((s) => s.jurisdictionCode === "440000").length;
  if (scenarios.length !== 36 || sh !== 18 || gd !== 18) {
    problems.push(`案例计数 ${scenarios.length}/${sh}/${gd} ≠ 36/18/18`);
  }
  if (m.caseCount !== scenarios.length || m.shanghaiCount !== sh || m.guangdongCount !== gd) {
    problems.push(`manifest声明计数 ${m.caseCount}/${m.shanghaiCount}/${m.guangdongCount} 与场景计数不一致`);
  }
  const uids = new Set<string>();
  for (const s of scenarios) {
    if (uids.has(s.caseUid)) problems.push(`案例UID重复：${s.caseUid}`);
    uids.add(s.caseUid);
    const recomputed = recomputeScenarioContentHashV2(s);
    if (recomputed !== s.contentHash) {
      problems.push(`案例 ${s.caseUid} contentHash不一致：声明 ${s.contentHash}，重算 ${recomputed}`);
    }
    if (s.generatorVersion !== GENERATOR_VERSION_V2) {
      problems.push(`案例 ${s.caseUid} 生成器版本 ${s.generatorVersion} ≠ ${GENERATOR_VERSION_V2}`);
    }
  }
  if (scenarios.length > 0) {
    const coverage = buildCoverageManifestV2(scenarios);
    if (coverage.manifestHash !== m.coverageManifestHash) {
      problems.push(`coverageManifestHash不一致：声明 ${m.coverageManifestHash}，重算 ${coverage.manifestHash}`);
    }
  }
  const recomputedManifest = recomputeCaseLibraryManifestHash(m);
  if (recomputedManifest !== m.manifestHash) {
    problems.push(`manifestHash不一致：声明 ${m.manifestHash}，重算 ${recomputedManifest}`);
  }
  const rendered = renderCaseLibraryMarkdown(m);
  if (normalizeEol(rendered) !== normalizeEol(input.markdown)) {
    problems.push("Markdown与由manifest重渲染的结果不一致（逐字节比较）");
  }
  return { ok: problems.length === 0, problems };
}
