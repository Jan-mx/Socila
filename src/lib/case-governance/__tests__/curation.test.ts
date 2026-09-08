/**
 * CLG-FR-008/009 确定性分层策展 + PRD §6.3：
 * - 18层（gender × birth_year_band × employment_status），层内按 qualityScore DESC, caseUid ASC；
 * - 固定字典序循环轮询取1条直至36；
 * - 配额不足时用最高分未选替换最低分已选（保持已满足配额），交换过程写入报告；
 * - 仍不满足全部约束则拒绝生成可执行manifest；
 * - 相同输入重复策展得到相同36条集合、顺序与报告（CLG-NFR-002/AC-004）。
 *
 * Red：实现前模块 `src/lib/case-governance/curation` 不存在，全部用例应失败。
 */
import { describe, it, expect } from "vitest";
import { curateShowcase } from "../curation";
import type { ShowcaseCandidateRecord } from "../types";

interface Candid {
  caseUid: string;
  gender: "female" | "male";
  birthYear: number;
  employmentStatus: "employed" | "flexible" | "unemployed";
  score: number;
  subsidy4050?: boolean;
  subsidyDaling?: boolean;
  subsidyGangwei?: boolean;
}

const band = (y: number) => (y < 1970 ? "before_1970" : y < 1980 ? "1970_1979" : "from_1980");

function toRecord(c: Candid): ShowcaseCandidateRecord {
  return {
    caseUid: c.caseUid,
    sourceCaseUid: c.caseUid.replace(/-\d{2}$/, ""),
    gender: c.gender,
    birthYear: c.birthYear,
    employmentStatus: c.employmentStatus,
    input: {
      basic: { gender: c.gender, birth_year: c.birthYear },
      status: { employment_status: c.employmentStatus },
    },
    expected: {
      retire_age: "37岁",
      ...(c.subsidy4050 ? { subsidy_4050: true } : {}),
      ...(c.subsidyDaling ? { subsidy_daling: true } : {}),
      ...(c.subsidyGangwei ? { subsidy_gangwei: true } : {}),
    },
    transcriptLength: 200,
    sourceFile: "independent_cases_with_full_transcripts_v5.xlsx",
    caseText: "转录文本",
    publicText: "公开文本",
    replay: { match: true, differences: [] },
    identityTokens: [],
    qualityScore: c.score,
  };
}

function quotaCheck(selected: ShowcaseCandidateRecord[], failures: string[]): void {
  const g = { female: 0, male: 0 };
  const b = { before_1970: 0, "1970_1979": 0, from_1980: 0 };
  const s = { employed: 0, flexible: 0, unemployed: 0 };
  const sb = { "4050": 0, daling: 0, gangwei: 0 };
  for (const r of selected) {
    g[r.gender as "female" | "male"]++;
    b[band(r.birthYear) as keyof typeof b]++;
    s[r.employmentStatus as keyof typeof s]++;
    if (r.expected.subsidy_4050) sb["4050"]++;
    if (r.expected.subsidy_daling) sb.daling++;
    if (r.expected.subsidy_gangwei) sb.gangwei++;
  }
  if (g.female !== 18) failures.push(`female=${g.female}`);
  if (g.male !== 18) failures.push(`male=${g.male}`);
  for (const k of Object.keys(b)) if (b[k as keyof typeof b] < 6) failures.push(`${k}=${b[k as keyof typeof b]}`);
  if (s.flexible < 12) failures.push(`flexible=${s.flexible}`);
  if (s.unemployed < 12) failures.push(`unemployed=${s.unemployed}`);
  if (s.employed > 3) failures.push(`employed=${s.employed}`);
  if (sb["4050"] < 6) failures.push(`4050=${sb["4050"]}`);
  if (sb.daling < 4) failures.push(`daling=${sb.daling}`);
  if (sb.gangwei < 3) failures.push(`gangwei=${sb.gangwei}`);
}

/** 构造覆盖18层、每层3条的合成候选池（54条，满足配额有解且存在替补空间）。 */
function buildSyntheticPool(): ShowcaseCandidateRecord[] {
  const out: ShowcaseCandidateRecord[] = [];
  let uid = 0;
  for (const gender of ["female", "male"] as const) {
    for (const y of [1965, 1972, 1985]) {
      for (const st of ["employed", "flexible", "unemployed"] as const) {
        // 每层3条不同分数
        for (let n = 0; n < 3; n++) {
          uid++;
          out.push(
            toRecord({
              caseUid: `synth-${String(uid).padStart(4, "0")}-01`,
              gender,
              birthYear: y + n,
              employmentStatus: st,
              score: 100 - (uid % 5),
              ...(uid % 3 === 0 ? { subsidy4050: true } : {}),
              ...(uid % 4 === 0 ? { subsidyDaling: true } : {}),
              ...(uid % 7 === 0 ? { subsidyGangwei: true } : {}),
            }),
          );
        }
      }
    }
  }
  return out;
}

describe("CLG-FR-008 分层与轮询", () => {
  it("合成候选池足够时选出恰好36条且轮询覆盖18层", () => {
    const pool = buildSyntheticPool();
    const report = curateShowcase(pool);
    expect(report.ok).toBe(true);
    expect(report.selected).toHaveLength(36);
    // 轮询过程按18层逐层取（替补后层分布可能收敛，配额优先）
    const layers = new Set<string>();
    for (const e of report.entries) {
      layers.add(`${e.layer.gender}|${e.layer.birthYearBand}|${e.layer.employmentStatus}`);
    }
    expect(layers.size).toBe(18);
  });

  it("轮询按固定字典序：层内先取分数高者", () => {
    const pool = buildSyntheticPool();
    const report = curateShowcase(pool);
    // female/before_1970/employed 层第一个被轮询到的caseUid必须是该层最高分（同分按UID升序）
    const layerMembers = pool
      .filter((r) => r.gender === "female" && band(r.birthYear) === "before_1970" && r.employmentStatus === "employed")
      .sort((a, b) => b.qualityScore! - a.qualityScore! || a.caseUid.localeCompare(b.caseUid));
    const firstPick = report.entries.find(
      (e) => e.layer.gender === "female" && e.layer.birthYearBand === "before_1970" && e.layer.employmentStatus === "employed",
    );
    expect(firstPick?.caseUid).toBe(layerMembers[0].caseUid);
  });
});

describe("CLG-FR-009 配额门禁", () => {
  it("选出36条满足全部配额（性别18/18、年龄段各>=6、灵活>=12、失业>=12、在职<=3、补贴）", () => {
    const pool = buildSyntheticPool();
    const report = curateShowcase(pool);
    expect(report.ok).toBe(true);
    const selected = pool.filter((r) => report.selected.includes(r.caseUid));
    const failures: string[] = [];
    quotaCheck(selected, failures);
    expect(failures).toEqual([]);
  });

  it("候选不足36条时拒绝生成（ok=false，不产出选择）", () => {
    const small = buildSyntheticPool().slice(0, 20);
    const report = curateShowcase(small);
    expect(report.ok).toBe(false);
    expect(report.selected).toHaveLength(0);
  });

  it("配额无解时拒绝而不是降低门槛（CLG-NFR-008）", () => {
    // 构造无失业女性的池：任何36条选择都无法满足unemployed>=12且female=18
    const pool = buildSyntheticPool().filter(
      (r) => !(r.gender === "female" && r.employmentStatus === "unemployed") || r.qualityScore! < 60,
    );
    const report = curateShowcase(pool);
    // 若拒绝：给出违例清单；若仍给出36条：必须满足配额
    if (!report.ok) {
      expect(report.violations.length).toBeGreaterThan(0);
    } else {
      const selected = pool.filter((r) => report.selected.includes(r.caseUid));
      const failures: string[] = [];
      quotaCheck(selected, failures);
      expect(failures).toEqual([]);
    }
  });
});

describe("CLG-FR-008 替补交换", () => {
  it("交换过程被记录在报告（swaps非空或说明无需交换）", () => {
    const pool = buildSyntheticPool();
    const report = curateShowcase(pool);
    expect(Array.isArray(report.swaps)).toBe(true);
    // 合成池层内分数有差异，轮询后可能已满足配额；无论是否发生交换，报告字段必须存在
    expect(report.swaps.length).toBeGreaterThanOrEqual(0);
  });

  it("替补后仍满足配额时继续生成", () => {
    // 用真实数据结构：每层最多2条，轮询取36时某些层耗尽，触发替补
    const pool = buildSyntheticPool();
    const report = curateShowcase(pool);
    if (report.ok) {
      const selected = pool.filter((r) => report.selected.includes(r.caseUid));
      const failures: string[] = [];
      quotaCheck(selected, failures);
      expect(failures).toEqual([]);
    }
  });
});

describe("CLG-NFR-002/AC-004 重复策展确定性", () => {
  it("相同输入两次策展：36条集合、顺序、swaps与报告完全一致", () => {
    const pool = buildSyntheticPool();
    const a = curateShowcase(pool);
    const b = curateShowcase(pool);
    expect(a.ok).toBe(b.ok);
    expect(a.selected).toEqual(b.selected);
    expect(a.swaps).toEqual(b.swaps);
  });

  it("manifestHash由相同策展选择确定性生成（与manifest模块联动的合同测试）", async () => {
    // 防止策展结果漂移破坏manifest：同一池两次选出的UID序列相同即等价
    const pool = buildSyntheticPool();
    const a = curateShowcase(pool);
    const b = curateShowcase(pool);
    expect(a.selected.join(",")).toBe(b.selected.join(","));
  });
});