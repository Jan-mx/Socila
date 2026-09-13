/**
 * SHV2-FR-001～007 / SHV2-AC-001～003 上海政策V2契约（零数据库依赖）。
 *
 * - FR-001 来源白名单：上海evidence的official_url只允许启用的官方域名；
 * - FR-002 完整证据：每条上海evidence具备12字段且证据目录4文件齐全；
 * - FR-004 时间版本：同一param_id多窗口连续且不重叠，历史值保留；
 * - FR-005 错误纠偏：2026-09-01有效事实与PRD §6.4一致，§6.5推断事实移除；
 * - FR-007 新规则：R-SH-UI-AMOUNT / R-SH-FLEX-CONTRIBUTION进入manifest与规则集，
 *   三档失业金、灵活缴费正常/缺参/越界行为正确；
 * - §7.3 黄金示例：上海11条、全地区44条。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { executeSingleRuleInMemory } from "@/lib/engine/orchestrator";
import { discoverRegionDsl } from "@/lib/dsl/region-manifest";
import {
  resolveParamWindowsAsOf,
  validateParamWindows,
  type ParamPackFile,
} from "@/lib/dsl/param-windows";
import type { RuleDefinition } from "@/types/engine";

const REPO_ROOT = process.cwd();
const SH_DIR = path.join(REPO_ROOT, "dsl/regions/shanghai_dsl_v1");
const SH_WHITELIST = new Set(["www.shanghai.gov.cn", "rsj.sh.gov.cn", "ybj.sh.gov.cn"]);

interface EvidenceEntry {
  document_id: string;
  jurisdiction_code: string;
  title: string;
  authority: string;
  official_url: string;
  fetched_at: string;
  content_sha256: string;
  artifact: string;
  parse_version: string;
  locator: { type: string; reference: string };
  excerpt: string;
}

function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

function loadPack(): ParamPackFile {
  return readJson<ParamPackFile>(path.join(SH_DIR, "params/policy_params_shanghai_base.json"));
}

function loadRule(ruleId: string): RuleDefinition {
  return readJson<RuleDefinition>(path.join(SH_DIR, "rules", `${ruleId}.json`));
}

function collectEvidence(value: unknown, out: EvidenceEntry[] = []): EvidenceEntry[] {
  if (Array.isArray(value)) {
    for (const v of value) collectEvidence(v, out);
    return out;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.document_id === "string" && typeof obj.content_sha256 === "string") {
      out.push(obj as unknown as EvidenceEntry);
    }
    for (const v of Object.values(obj)) collectEvidence(v, out);
  }
  return out;
}

function allShanghaiEvidence(): EvidenceEntry[] {
  const out: EvidenceEntry[] = [];
  collectEvidence(loadPack(), out);
  const manifest = readJson<{ rules: Array<{ file: string }> }>(
    path.join(SH_DIR, "rules_manifest.json"),
  );
  for (const r of manifest.rules) {
    collectEvidence(readJson(path.join(SH_DIR, "rules", r.file)), out);
  }
  return out;
}

describe("SHV2-FR-001/002 上海证据来源与完整性", () => {
  it("上海evidence的official_url全部落在启用白名单域名内", () => {
    const entries = allShanghaiEvidence();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      const host = new URL(e.official_url).hostname;
      expect(SH_WHITELIST.has(host), `${e.document_id} 使用非白名单域名 ${host}`).toBe(true);
      expect(e.jurisdiction_code).toBe("310000");
    }
  });

  it("每条上海evidence具备12个必填字段且证据目录4文件齐全", () => {
    for (const e of allShanghaiEvidence()) {
      for (const k of [
        "document_id",
        "jurisdiction_code",
        "title",
        "authority",
        "official_url",
        "fetched_at",
        "content_sha256",
        "artifact",
        "parse_version",
        "excerpt",
      ] as const) {
        expect(typeof e[k], `${e.document_id}.${k}`).toBe("string");
        expect((e[k] as string).length, `${e.document_id}.${k} 为空`).toBeGreaterThan(0);
      }
      expect(e.content_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof e.locator?.type).toBe("string");
      expect(typeof e.locator?.reference).toBe("string");
      const dir = path.join(REPO_ROOT, path.dirname(e.artifact));
      for (const f of ["original.html", "extracted-text.txt", "http-headers.txt", "meta.json"]) {
        expect(existsSync(path.join(dir, f)), `${e.document_id} 缺少 ${f}`).toBe(true);
      }
    }
  });
});

describe("SHV2-FR-004 参数有效期版本", () => {
  it("同一param_id的多个窗口连续且不重叠，至多一个开放上界", () => {
    const violations = validateParamWindows(loadPack());
    expect(violations).toEqual([]);
  });

  it("历史值以闭合窗口保留：失业金三档在三个连续窗口各取正确值", () => {
    const pack = loadPack();
    const at2024 = resolveParamWindowsAsOf(pack, "2024-12-01");
    const at2025 = resolveParamWindowsAsOf(pack, "2025-12-01");
    const at2026 = resolveParamWindowsAsOf(pack, "2026-09-01");
    expect(at2024["P-SH-UNEMPLOYMENT-BENEFIT-TIER1"]).toBe(2255);
    expect(at2024["P-SH-UNEMPLOYMENT-BENEFIT-TIER2"]).toBe(1804);
    expect(at2024["P-SH-UNEMPLOYMENT-BENEFIT-EXTENDED"]).toBe(1595);
    expect(at2025["P-SH-UNEMPLOYMENT-BENEFIT-TIER1"]).toBe(2305);
    expect(at2025["P-SH-UNEMPLOYMENT-BENEFIT-TIER2"]).toBe(1844);
    expect(at2025["P-SH-UNEMPLOYMENT-BENEFIT-EXTENDED"]).toBe(1650);
    expect(at2026["P-SH-UNEMPLOYMENT-BENEFIT-TIER1"]).toBe(2340);
    expect(at2026["P-SH-CONTRIB-BASE-LOWER"]).toBe(7546);
    // 2026-07-01基数调整：2026-06-30无有效基数参数（原2025年度值7460/37302无官方原文，已按§6.5移除）
    const before = resolveParamWindowsAsOf(pack, "2026-06-30");
    expect(before["P-SH-CONTRIB-BASE-LOWER"]).toBeUndefined();
    expect(before["P-SH-UNEMPLOYMENT-BENEFIT-TIER1"]).toBe(2305);
  });
});

describe("SHV2-FR-005 / SHV2-AC-002 2026-09-01有效事实纠偏", () => {
  const asOf = resolveParamWindowsAsOf(loadPack(), "2026-09-01");

  it("社保缴费基数下限7546、上限37731", () => {
    expect(asOf["P-SH-CONTRIB-BASE-LOWER"]).toBe(7546);
    expect(asOf["P-SH-CONTRIB-BASE-UPPER"]).toBe(37731);
  });

  it("失业金三档2340/1872/1690", () => {
    expect(asOf["P-SH-UNEMPLOYMENT-BENEFIT-TIER1"]).toBe(2340);
    expect(asOf["P-SH-UNEMPLOYMENT-BENEFIT-TIER2"]).toBe(1872);
    expect(asOf["P-SH-UNEMPLOYMENT-BENEFIT-EXTENDED"]).toBe(1690);
  });

  it("月最低工资2740", () => {
    expect(asOf["P-SH-MIN-WAGE"]).toBe(2740);
  });

  it("灵活就业养老20%、医保10%", () => {
    expect(asOf["P-SH-PENSION-RATE-FLEX"]).toBe(0.2);
    expect(asOf["P-SH-MEDICAL-RATE-FLEX"]).toBe(0.1);
  });

  it("医保等待期6个月，中断不超过3个月豁免", () => {
    expect(asOf["P-SH-MI-WAITING-PERIOD-MONTHS"]).toBe(6);
    expect(asOf["P-SH-MI-GAP-WAIVER-MONTHS"]).toBe(3);
  });

  it("退休职工医保累计缴费年限统一为15年（不再使用男25/女20）", () => {
    expect(asOf["P-MI-LIFETIME-REQUIRED-YEARS"]).toBe(15);
    expect(asOf["P-MI-LIFETIME-MALE-YEARS"]).toBe(15);
    expect(asOf["P-MI-LIFETIME-FEMALE-YEARS"]).toBe(15);
  });

  it("就业困难人员补贴一般累计不超过3年；不再固定8年延长期", () => {
    expect(asOf["P-SH-4050-MAX-YEARS-GENERAL"]).toBe(3);
    expect(asOf["P-SH-4050-MAX-YEARS-NEAR-RETIRE"]).toBeUndefined();
    expect(asOf["P-SH-4050-NEAR-RETIRE-THRESHOLD-YEARS"]).toBe(5);
  });

  it("移除固定7/8月补差与transcript/policy伪引用", () => {
    const pack = loadPack();
    const all = [...pack.params, ...pack.tables];
    expect(all.find((p) => p.param_id === "T-SH-PAY-GAP-MONTHS")).toBeUndefined();
    expect(all.find((p) => p.param_id === "P-SH-PAY-GAP-AFFECTS-NEXT-MONTH")).toBeUndefined();
    for (const p of all) {
      const src = String(p.source ?? "");
      expect(src, `${p.param_id} 仍使用伪引用 source=${src}`).not.toMatch(/^(policy|transcript)(:|$)/);
    }
  });
});

interface CalcOut {
  needs_agent?: boolean;
  warnings?: Array<{ warning_id: string }>;
  unemployment: { monthly_amount_est: number | null; benefit_stage: string | null };
  flex: {
    applicable: boolean;
    contrib_base: number | null;
    pension_monthly: number | null;
    medical_monthly: number | null;
    total_monthly: number | null;
  };
}

describe("SHV2-FR-007 / SHV2-AC-003 新规则", () => {
  it("R-SH-UI-AMOUNT与R-SH-FLEX-CONTRIBUTION进入manifest与规则集（规则集26项）", () => {
    const manifest = readJson<{ rules: Array<{ rule_id: string }> }>(
      path.join(SH_DIR, "rules_manifest.json"),
    );
    const ruleSet = readJson<{ rules: string[] }>(
      path.join(SH_DIR, "rule_sets/rule_set_shanghai_plan_v1.json"),
    );
    const ids = manifest.rules.map((r) => r.rule_id);
    expect(ids).toContain("R-SH-UI-AMOUNT");
    expect(ids).toContain("R-SH-FLEX-CONTRIBUTION");
    expect(ruleSet.rules).toHaveLength(26);
    expect(ruleSet.rules.indexOf("R-SH-UI-AMOUNT")).toBeGreaterThan(
      ruleSet.rules.indexOf("R-410-UNEMPLOYMENT-DURATION"),
    );
    expect(ruleSet.rules.indexOf("R-SH-FLEX-CONTRIBUTION")).toBeGreaterThan(
      ruleSet.rules.indexOf("R-SH-UI-AMOUNT"),
    );
  });

  const uiParams = {
    "P-SH-UNEMPLOYMENT-BENEFIT-TIER1": 2340,
    "P-SH-UNEMPLOYMENT-BENEFIT-TIER2": 1872,
    "P-SH-UNEMPLOYMENT-BENEFIT-EXTENDED": 1690,
  };

  function runUi(user: Record<string, unknown>, calc: Record<string, unknown>, params = uiParams) {
    const rule = loadRule("R-SH-UI-AMOUNT");
    const result = executeSingleRuleInMemory(rule, { user, params, calc, plan: {} });
    return result.ctx.calc as CalcOut;
  }

  it("三档失业金：显式阶段1-12→2340、13-24→1872、延长→1690", () => {
    for (const [stage, amount] of [
      ["1-12", 2340],
      ["13-24", 1872],
      ["extended", 1690],
    ] as const) {
      const calc = runUi(
        { social: { ui_benefit_stage: stage } },
        { unemployment: { eligible: true } },
      );
      expect(calc.unemployment.monthly_amount_est).toBe(amount);
      expect(calc.unemployment.benefit_stage).toBe(stage);
      expect(calc.needs_agent).not.toBe(true);
    }
  });

  it("按已领取月数推导阶段：已领5个月→1-12档、已领15个月→13-24档", () => {
    const c1 = runUi({ social: { ui_claimed_months: 5 } }, { unemployment: { eligible: true } });
    expect(c1.unemployment.benefit_stage).toBe("1-12");
    expect(c1.unemployment.monthly_amount_est).toBe(2340);
    const c2 = runUi({ social: { ui_claimed_months: 15 } }, { unemployment: { eligible: true } });
    expect(c2.unemployment.benefit_stage).toBe("13-24");
    expect(c2.unemployment.monthly_amount_est).toBe(1872);
  });

  it("缺领取阶段→needs_agent且不估算；已领≥24个月且未确认延长资格→needs_agent", () => {
    const c1 = runUi({ social: {} }, { unemployment: { eligible: true } });
    expect(c1.needs_agent).toBe(true);
    expect(c1.unemployment.monthly_amount_est).toBeNull();
    const c2 = runUi({ social: { ui_claimed_months: 24 } }, { unemployment: { eligible: true } });
    expect(c2.needs_agent).toBe(true);
    expect(c2.unemployment.monthly_amount_est).toBeNull();
  });

  it("资格不确定→needs_agent不估算；无资格→金额0", () => {
    const c1 = runUi({ social: { ui_benefit_stage: "1-12" } }, { unemployment: { eligible: null } });
    expect(c1.needs_agent).toBe(true);
    expect(c1.unemployment.monthly_amount_est).toBeNull();
    const c2 = runUi({ social: { ui_benefit_stage: "1-12" } }, { unemployment: { eligible: false } });
    expect(c2.unemployment.monthly_amount_est).toBe(0);
    expect(c2.needs_agent).not.toBe(true);
  });

  it("日期无有效参数→needs_agent不估算", () => {
    const calc = runUi(
      { social: { ui_benefit_stage: "1-12" } },
      { unemployment: { eligible: true } },
      { "P-SH-UNEMPLOYMENT-BENEFIT-TIER1": null, "P-SH-UNEMPLOYMENT-BENEFIT-TIER2": null, "P-SH-UNEMPLOYMENT-BENEFIT-EXTENDED": null } as never,
    );
    expect(calc.needs_agent).toBe(true);
    expect(calc.unemployment.monthly_amount_est).toBeNull();
  });

  const flexParams = {
    "P-SH-CONTRIB-BASE-LOWER": 7546,
    "P-SH-CONTRIB-BASE-UPPER": 37731,
    "P-SH-PENSION-RATE-FLEX": 0.2,
    "P-SH-MEDICAL-RATE-FLEX": 0.1,
  };

  function runFlex(user: Record<string, unknown>, params: Record<string, unknown> = flexParams) {
    const rule = loadRule("R-SH-FLEX-CONTRIBUTION");
    const result = executeSingleRuleInMemory(rule, { user, params, calc: {}, plan: {} });
    return result.ctx.calc as CalcOut;
  }

  it("灵活就业按下限基数缴费：养老1509.2、医保754.6、合计2263.8", () => {
    const calc = runFlex({
      status: { employment_status: "flexible" },
      social: { flex_contrib_base: 7546 },
    });
    expect(calc.flex.applicable).toBe(true);
    expect(calc.flex.contrib_base).toBe(7546);
    expect(calc.flex.pension_monthly).toBe(1509.2);
    expect(calc.flex.medical_monthly).toBe(754.6);
    expect(calc.flex.total_monthly).toBe(2263.8);
    expect(calc.needs_agent).not.toBe(true);
  });

  it("基数越界不得静默截断：低于下限/高于上限→警告+needs_agent", () => {
    for (const base of [7000, 40000]) {
      const calc = runFlex({
        status: { employment_status: "flexible" },
        social: { flex_contrib_base: base },
      });
      expect(calc.needs_agent).toBe(true);
      expect(calc.flex.total_monthly).toBeNull();
      const ids = (calc.warnings ?? []).map((w) => w.warning_id);
      expect(ids.some((id) => /FLEX-BASE/.test(id))).toBe(true);
    }
  });

  it("缺基数→needs_agent；缺费率/有效期参数→needs_agent", () => {
    const c1 = runFlex({ status: { employment_status: "flexible" }, social: {} });
    expect(c1.needs_agent).toBe(true);
    expect(c1.flex.total_monthly).toBeNull();
    const c2 = runFlex(
      { status: { employment_status: "flexible" }, social: { flex_contrib_base: 7546 } },
      { ...flexParams, "P-SH-PENSION-RATE-FLEX": null },
    );
    expect(c2.needs_agent).toBe(true);
    expect(c2.flex.total_monthly).toBeNull();
  });

  it("非灵活就业→applicable=false且不伪造缴费", () => {
    const calc = runFlex({ status: { employment_status: "employed" }, social: {} });
    expect(calc.flex.applicable).toBe(false);
    expect(calc.needs_agent).not.toBe(true);
  });
});

describe("§7.3 黄金示例计数", () => {
  it("上海example=11、全地区example=44", () => {
    const regions = discoverRegionDsl();
    let total = 0;
    let shanghai = 0;
    for (const r of regions) {
      const tests = readJson<{ tests: unknown[] }>(r.testsPath).tests;
      total += tests.length;
      if (r.manifest.jurisdiction_code === "310000") shanghai = tests.length;
    }
    expect(shanghai).toBe(11);
    expect(total).toBe(44);
  });
});
