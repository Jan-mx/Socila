/**
 * NRP-FR-002/FR-004/NFR-001 引用契约（防伪造引用的硬门禁）：
 * 全部地区DSL资产中的每个 evidence 条目必须——
 * 1) 指向仓库内存在的原件artifact（original.html）与meta.json；
 * 2) meta.json 的 sha256 与条目 content_sha256 一致；
 * 3) excerpt 经空白归一化后逐字出现在 extracted-text.txt 中（摘录=原文）；
 * 4) official_url 与 meta.json 记录一致。
 * 同时：全部地区参数与政策承载规则的 evidence 覆盖率为100%。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

interface EvidenceEntry {
  document_id: string;
  jurisdiction_code: string;
  title?: string;
  authority?: string;
  official_url?: string;
  fetched_at?: string;
  content_sha256: string;
  artifact: string;
  parse_version?: string;
  locator?: { type?: string; reference?: string };
  excerpt: string;
}

const REPO_ROOT = process.cwd();
const REGION_DIRS = ["cn_dsl_v1", "guangdong_dsl_v1"].map((d) =>
  path.join(REPO_ROOT, "dsl/regions", d),
);

/** 计算框架/归一化规则不断言政策事实（见验收报告分类表），不要求政策引用。 */
const COMPUTATION_RULES = new Set([
  "R-010-PARSE-BIRTH-YEAR",
  "R-011-BUILD-BIRTH-DATE",
  "R-012-NORMALIZE-GENDER",
  "R-120-COMPUTE-RETIRE-DATE",
  "R-210-PENSION-GAP",
  "R-300-MI-GAP-MONTHS",
  "R-700-PLAN-TEMPLATE",
  "R-900-FINAL-GATE",
]);

function normalize(text: string): string {
  return text.replace(/\s+/g, "");
}

function collectEvidence(value: unknown, out: EvidenceEntry[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collectEvidence(v, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (
      typeof obj.document_id === "string" &&
      typeof obj.content_sha256 === "string" &&
      typeof obj.excerpt === "string"
    ) {
      out.push(obj as unknown as EvidenceEntry);
    }
    for (const v of Object.values(obj)) collectEvidence(v, out);
  }
}

function jsonFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

function listEvidenceInRegion(regionDir: string): EvidenceEntry[] {
  const out: EvidenceEntry[] = [];
  for (const f of jsonFiles(path.join(regionDir, "rules"))) {
    collectEvidence(
      JSON.parse(readFileSync(path.join(regionDir, "rules", f), "utf8")),
      out,
    );
  }
  for (const f of jsonFiles(path.join(regionDir, "params"))) {
    collectEvidence(
      JSON.parse(readFileSync(path.join(regionDir, "params", f), "utf8")),
      out,
    );
  }
  return out;
}

describe("政策引用契约（NRP-FR-002/FR-004/NFR-001）", () => {
  it("全部地区的 evidence 条目可回溯到抓取原件且摘录逐字一致", () => {
    const entries = REGION_DIRS.flatMap((d) => listEvidenceInRegion(d));
    expect(entries.length).toBeGreaterThanOrEqual(10);

    for (const e of entries) {
      const metaPath = path.join(REPO_ROOT, path.dirname(e.artifact), "meta.json");
      const originalPath = path.join(REPO_ROOT, e.artifact);
      const extractedPath = path.join(
        REPO_ROOT,
        path.dirname(e.artifact),
        "extracted-text.txt",
      );
      expect(existsSync(originalPath), `原件缺失: ${e.artifact}`).toBe(true);
      expect(existsSync(metaPath), `meta.json缺失: ${e.document_id}`).toBe(true);
      expect(existsSync(extractedPath), `extracted-text缺失: ${e.document_id}`).toBe(
        true,
      );

      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
        docId: string;
        sha256: string;
        officialUrl?: string;
      };
      expect(meta.docId).toBe(e.document_id);
      expect(meta.sha256).toBe(e.content_sha256);

      const extracted = readFileSync(extractedPath, "utf8");
      expect(
        normalize(extracted).includes(normalize(e.excerpt)),
        `${e.document_id} 的摘录未在原文中找到（防伪造引用）: ${e.excerpt.slice(0, 60)}…`,
      ).toBe(true);

      if (e.official_url) {
        expect(e.official_url).toBe(meta.officialUrl);
      }
    }
  });

  it("全部地区参数的引用覆盖率为100%", () => {
    for (const regionDir of REGION_DIRS) {
      for (const f of jsonFiles(path.join(regionDir, "params"))) {
        const pack = JSON.parse(
          readFileSync(path.join(regionDir, "params", f), "utf8"),
        ) as {
          params: Array<Record<string, unknown>>;
          tables: Array<Record<string, unknown>>;
        };
        for (const p of [...pack.params, ...pack.tables]) {
          const entries: EvidenceEntry[] = [];
          collectEvidence(p, entries);
          expect(
            entries.length,
            `参数 ${p.param_id as string} 缺少权威引用（NRP-NFR-001）`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("政策承载规则的引用覆盖率为100%（计算框架规则白名单除外）", () => {
    for (const regionDir of REGION_DIRS) {
      for (const f of jsonFiles(path.join(regionDir, "rules"))) {
        const rule = JSON.parse(
          readFileSync(path.join(regionDir, "rules", f), "utf8"),
        ) as { rule_id: string; evidence?: EvidenceEntry[] };
        const entries: EvidenceEntry[] = [];
        collectEvidence(rule.evidence ?? [], entries);
        if (COMPUTATION_RULES.has(rule.rule_id)) continue;
        expect(
          entries.length,
          `政策承载规则 ${rule.rule_id} 缺少权威引用（NRP-NFR-001）`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
