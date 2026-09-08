/**
 * CLG-FR-003/004 展示案例来源链与保留集合：
 * - normalizeCaseUid去除末尾两位序号（与excel-import既有归一化一致）；
 * - 真实语料（data/test-cases-from-transcripts.json）117条展示候选全部解析到
 *   851案例集合中的唯一来源（116个不同案例），歧义/缺失必须报错；
 * - KEEP = is_regression案例 ∪ 全部展示来源（归一化后），真实语料并集=452（CLG-AC-003）。
 *
 * Red：实现前模块 `src/lib/case-governance/source-chain` 不存在，全部用例应失败。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  normalizeCaseUid,
  resolveSourceCaseUids,
  computeRetainedCaseSet,
} from "../source-chain";

const DATA_DIR = path.resolve(process.cwd(), "data");

interface SourceRecord {
  case_uid: string;
  input: { basic: { gender: string; birth_year?: number }; status?: { employment_status?: string } };
  expected: { retire_age?: string };
  case_text_excerpt: string;
}

function loadShowcaseCandidates(): Array<{ caseUid: string; sourceCaseUid: string }> {
  const raw = JSON.parse(
    readFileSync(path.join(DATA_DIR, "test-cases-from-transcripts.json"), "utf-8"),
  ) as SourceRecord[];
  // 与builder.filterHighQualityCases + prepareShowcaseRows去重键保持一致
  const seen = new Set<string>();
  const out: Array<{ caseUid: string; sourceCaseUid: string }> = [];
  for (const r of raw) {
    if (!r.input.basic.birth_year || !r.input.basic.gender || !r.expected.retire_age) continue;
    if (r.case_text_excerpt.length <= 100) continue;
    const key = `${r.input.basic.gender}-${r.input.basic.birth_year}-${r.input.status?.employment_status ?? "unknown"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ caseUid: r.case_uid, sourceCaseUid: r.case_uid.replace(/-\d{2}$/, "") });
  }
  return out;
}

describe("CLG-FR-003 来源UID归一化", () => {
  it("去除末尾两位序号：71c427049305-01 → 71c427049305", () => {
    expect(normalizeCaseUid("71c427049305-01")).toBe("71c427049305");
  });

  it("无序号UID保持不变", () => {
    expect(normalizeCaseUid("54b3222e1978")).toBe("54b3222e1978");
  });

  it("归一化幂等", () => {
    expect(normalizeCaseUid(normalizeCaseUid("abc-01"))).toBe(normalizeCaseUid("abc-01"));
  });
});

describe("CLG-AC-003 真实语料来源解析", () => {
  it("117条展示候选全部解析到唯一来源且都在851案例集合中", () => {
    const candidates = loadShowcaseCandidates();
    expect(candidates).toHaveLength(117);

    // 851案例UID集合：从独立案例工作簿读取
    const wb = XLSX.read(readFileSync(path.join(DATA_DIR, "independent_cases_with_full_transcripts_v5.xlsx")), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }) as Array<{ transcript_id?: string }>;
    const caseUids = new Set(rows.map((r) => String(r.transcript_id)));
    expect(caseUids.size).toBe(851);

    const resolved = resolveSourceCaseUids(candidates, caseUids);
    expect(resolved.size).toBe(117);
    // 116个不同来源案例（CLG-AC-003）
    expect(new Set([...resolved.values()]).size).toBe(116);
  });

  it("来源UID在案例集合中不存在时报错而不是静默通过", () => {
    const candidates = [{ caseUid: "AAA-01", sourceCaseUid: "AAA" }];
    expect(() => resolveSourceCaseUids(candidates, new Set(["BBB"]))).toThrow();
  });
});

describe("CLG-FR-001/§6.2 KEEP=452 保留集合", () => {
  it("真实语料：回归451 + 展示来源116 → 并集恰好452（CLG-AC-002/010前置）", () => {
    const read = (f: string): Array<Record<string, unknown>> => {
      const wb = XLSX.read(readFileSync(path.join(DATA_DIR, f)), { type: "buffer" });
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }) as Array<Record<string, unknown>>;
    };
    const tests = read("runnable_testdata_from_cases_v5.xlsx");
    const regressionUids = new Set(tests.map((r) => normalizeCaseUid(String(r.source_case_uid))));
    expect(regressionUids.size).toBe(451);

    const candidates = loadShowcaseCandidates();
    const showcaseUids = new Set(candidates.map((c) => c.sourceCaseUid));
    expect(showcaseUids.size).toBe(116);

    const kept = computeRetainedCaseSet(regressionUids, showcaseUids);
    expect(kept.size).toBe(452);
  });
});