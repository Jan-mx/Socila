/**
 * RCL-GEN-2.0 案例文案渲染（SHV2-FR-012/013/015、§9.2～9.4）。
 *
 * 数值单源纪律（SHV2-FR-015/AC-011）：标题、问题、回答、case_text中的每一个数字都只能来自
 * `input`（合成人物条件）、`expected`（规则引擎输出）、`asOfDate` 与 `policySources`
 * （标题/定位/摘录）。本模块不做任何算术派生（如月→年换算）、不引用政策常量（如50%、12个月）。
 * 引擎未计算的值渲染为"未估算/需补充"，绝不以默认值填充。
 */
import { GD_CLAIM_CITY_CODE_TO_NAME } from "@/server/modules/planning/application/claim-city";
import {
  CAPABILITY_LABELS,
  EMPLOYMENT_LABELS,
  FEMALE_RETIRE_TYPE_LABELS,
  GENDER_LABELS,
  SYNTHETIC_CASE_LABEL,
  SYNTHETIC_DISCLAIMER,
  regionLabel,
} from "@/lib/showcase/labels";
import type { PolicySource } from "@/lib/showcase/case-nature";
import type { ScenarioAssertion } from "./replay";

export interface ScenarioDraftV2 {
  scenarioKey: string;
  caseUid: string;
  testUid: string;
  jurisdictionCode: "310000" | "440000";
  asOfDate: string;
  capability: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  assertions: ScenarioAssertion[];
  coverageObligations: string[];
  policySources: PolicySource[];
  snapshotId: string;
  snapshotContentHash: string;
  generatorVersion: string;
}

export interface RenderedContentV2 {
  title: string;
  userMessage: string;
  aiResponse: string;
  caseText: string;
  topics: string[];
  category: string;
}

const NOT_ESTIMATED = "未估算（需补充信息）";

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 引擎/输入值 → 文本；null/undefined → 明确"未估算"。 */
function n(v: unknown): string {
  if (v === null || v === undefined) return NOT_ESTIMATED;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : NOT_ESTIMATED;
  if (typeof v === "boolean") return v ? "是" : "否";
  return String(v);
}

function has(v: unknown): boolean {
  return v !== null && v !== undefined;
}

interface PersonaFacts {
  basic: Record<string, unknown>;
  status: Record<string, unknown>;
  social: Record<string, unknown>;
  mi: Record<string, unknown>;
  subsidy: Record<string, unknown>;
  profile: Record<string, unknown>;
  genderLabel: string;
  femaleTypeLabel: string | null;
  employment: string;
  employmentLabel: string;
  region: string;
}

function facts(d: ScenarioDraftV2): PersonaFacts {
  const basic = rec(d.input.basic);
  const status = rec(d.input.status);
  const employment = String(status.employment_status ?? "");
  return {
    basic,
    status,
    social: rec(d.input.social),
    mi: rec(d.input.mi),
    subsidy: rec(d.input.subsidy),
    profile: rec(d.input.profile),
    genderLabel: GENDER_LABELS[String(basic.gender)] ?? String(basic.gender ?? ""),
    femaleTypeLabel:
      basic.gender === "female" && typeof basic.female_retire_type === "string"
        ? (FEMALE_RETIRE_TYPE_LABELS[basic.female_retire_type] ?? basic.female_retire_type)
        : null,
    employment,
    employmentLabel: EMPLOYMENT_LABELS[employment] ?? employment,
    region: regionLabel(d.jurisdictionCode),
  };
}

/** 合成人物画像（case_text/回答/Markdown共用；全部取自input）。 */
export function describePersona(d: ScenarioDraftV2): string[] {
  const f = facts(d);
  const lines: string[] = [];
  lines.push(`地区：${f.region}`);
  const birth = `${n(f.basic.birth_year)}年${n(f.basic.birth_month)}月${n(f.basic.birth_day)}日出生`;
  lines.push(`性别与出生：${f.genderLabel}${f.femaleTypeLabel ? `（${f.femaleTypeLabel}）` : ""}，${birth}`);
  const onUi = f.status.on_unemployment_benefit;
  lines.push(
    `就业状态：${f.employmentLabel}${onUi === true ? "，正在领取失业保险金" : onUi === false ? "，未在领取失业保险金" : ""}`,
  );
  if (has(f.social.pension_contrib_months) || has(f.social.medical_contrib_months)) {
    lines.push(
      `社保累计缴费：养老保险${n(f.social.pension_contrib_months)}个月，职工医保${n(f.social.medical_contrib_months)}个月`,
    );
  }
  if (has(f.social.unemployment_insurance_years)) {
    let ui = `失业保险累计缴费：${n(f.social.unemployment_insurance_years)}年`;
    if (has(f.social.ui_benefit_stage)) ui += `；当前领取阶段：第${n(f.social.ui_benefit_stage)}个月`;
    if (has(f.social.ui_claimed_months)) ui += `；本段已领取：${n(f.social.ui_claimed_months)}个月`;
    lines.push(ui);
  }
  if (has(f.social.flex_contrib_base)) {
    lines.push(`灵活就业月缴费基数（本人选择）：${n(f.social.flex_contrib_base)}元`);
  }
  if (has(f.mi.enroll_date)) {
    lines.push(
      `职工医保衔接：上次缴费结束${n(f.mi.prev_end_date)}，本次参保${n(f.mi.enroll_date)}`,
    );
  }
  if (has(f.subsidy.has_employment_difficulty_cert)) {
    lines.push(`就业困难人员认定：${f.subsidy.has_employment_difficulty_cert === true ? "已认定" : "未认定"}`);
  }
  if (has(f.subsidy.months_to_legal_retire)) {
    lines.push(`距法定退休：${n(f.subsidy.months_to_legal_retire)}个月`);
  }
  if (has(f.profile.claim_city_code)) {
    const code = String(f.profile.claim_city_code);
    const name = GD_CLAIM_CITY_CODE_TO_NAME[code];
    lines.push(`失业保险金领取地市：${name ? `${name}（${code}）` : code}`);
  }
  if (has(f.social.months_paid_at_old_base)) {
    lines.push(`新缴费基数生效后仍按旧基数缴费的月数：${n(f.social.months_paid_at_old_base)}`);
  }
  return lines;
}

interface CapabilityNarrative {
  /** 结论摘要（一句话）。 */
  conclusion: string;
  /** 关键测算结果（bullet）。 */
  results: string[];
  /** 咨询问题（自然语言）。 */
  question: string;
  /** 标题后缀（区分不适用/需补充/口径）。 */
  titleSuffix: string;
}

function retirementLines(exp: Record<string, unknown>): string[] {
  const r = rec(exp.retirement);
  const out = [
    `法定退休年龄：${n(r.legal_retire_age_years)}岁${n(r.legal_retire_age_months)}个月`,
    `法定退休日期：${n(r.legal_retire_date)}`,
  ];
  if (has(r.original_retire_age_years)) out.push(`改革前对应法定退休年龄：${n(r.original_retire_age_years)}岁`);
  if (has(r.flex_adjusted)) {
    out.push(`弹性退休：${r.flex_adjusted === true ? "已按本人意愿调整" : "未申请弹性提前或延迟，按标准年龄执行"}`);
  }
  return out;
}

function narrative(d: ScenarioDraftV2): CapabilityNarrative {
  const f = facts(d);
  const exp = d.expected;
  const birthPhrase = `${n(f.basic.birth_year)}年${n(f.basic.birth_month)}月出生的${f.genderLabel}${f.femaleTypeLabel ? `（${f.femaleTypeLabel}）` : ""}`;
  const where = f.region === "上海" ? "在上海" : "在广东";
  const employedPhrase =
    f.employment === "employed" ? "在单位在职参保" : f.employment === "flexible" ? "以灵活就业身份参保" : "处于失业状态";

  switch (d.capability) {
    case "retirement": {
      const r = rec(exp.retirement);
      return {
        conclusion: `按现行渐进式延迟法定退休年龄政策测算，法定退休年龄为${n(r.legal_retire_age_years)}岁${n(r.legal_retire_age_months)}个月，对应法定退休日期${n(r.legal_retire_date)}。`,
        results: retirementLines(exp),
        question: `我是${birthPhrase}，目前${where}${employedPhrase}，按现行延迟退休政策，我的法定退休年龄和法定退休日期分别是什么？`,
        titleSuffix: "",
      };
    }
    case "pension": {
      const p = rec(exp.pension);
      const r = rec(exp.retirement);
      const gapZero = p.gap_months === 0;
      return {
        conclusion: gapZero
          ? `退休年度${n(r.legal_retire_year)}对应的最低缴费年限为${n(p.min_years_required)}年；按当前累计缴费${n(f.social.pension_contrib_months)}个月测算，已满足最低缴费年限，缺口${n(p.gap_months)}个月。`
          : `退休年度${n(r.legal_retire_year)}对应的最低缴费年限为${n(p.min_years_required)}年；按当前累计缴费${n(f.social.pension_contrib_months)}个月测算，缴费缺口${n(p.gap_months)}个月，向上取整约${n(p.gap_years_ceil)}年。`,
        results: [
          `最低缴费年限（按退休年度）：${n(p.min_years_required)}年`,
          `养老保险累计缴费（输入）：${n(f.social.pension_contrib_months)}个月`,
          `缴费缺口：${n(p.gap_months)}个月（向上取整${n(p.gap_years_ceil)}年）`,
          ...retirementLines(exp).slice(0, 2),
        ],
        question: `我是${birthPhrase}，${where}${employedPhrase}，养老保险累计缴了${n(f.social.pension_contrib_months)}个月。到退休时最低缴费年限是多少年、我还差多少个月？`,
        titleSuffix: gapZero ? "（年限已满）" : "",
      };
    }
    case "medical": {
      const mi = rec(exp.mi);
      const waiting = mi.waiting_required === true;
      const gapLine = has(mi.gap_months)
        ? waiting
          ? `本次参保前中断${n(mi.gap_months)}个月，超过衔接豁免范围，需等待${n(mi.waiting_period_months)}个月后享受待遇。`
          : `本次参保前中断${n(mi.gap_months)}个月，在衔接豁免范围内，无需等待期（等待期${n(mi.waiting_period_months)}个月）。`
        : "";
      const question =
        f.employment === "flexible"
          ? `我是${birthPhrase}，${where}以灵活就业身份参加职工医保，上次医保${n(f.mi.prev_end_date)}停缴、${n(f.mi.enroll_date)}重新参保，这次是否有等待期？退休时享受医保待遇还差多少个月？`
          : f.employment === "unemployed"
            ? `我是${birthPhrase}，目前${where}失业并领取失业保险金，医保${n(f.mi.prev_end_date)}停缴后${n(f.mi.enroll_date)}接续参保，会不会有等待期？退休医保年限还差多少？`
            : `我是${birthPhrase}，${where}在单位参保，职工医保累计缴了${n(f.social.medical_contrib_months)}个月，退休时享受医保待遇需要累计缴满多少个月、还差多少？`;
      return {
        conclusion: `退休时享受职工医保待遇所需累计缴费${n(mi.lifetime_required_months)}个月；当前累计${n(f.social.medical_contrib_months)}个月，缺口${n(mi.lifetime_gap_months)}个月。${gapLine}`,
        results: [
          `退休所需累计缴费：${n(mi.lifetime_required_months)}个月`,
          `当前累计缴费（输入）：${n(f.social.medical_contrib_months)}个月`,
          `年限缺口：${n(mi.lifetime_gap_months)}个月`,
          ...(has(mi.gap_months) ? [`本次参保前中断：${n(mi.gap_months)}个月`] : []),
          `等待期：${n(mi.waiting_period_months)}个月（${waiting ? "需要等待" : "无需等待"}）`,
        ],
        question,
        titleSuffix: waiting ? "（触发等待期）" : "",
      };
    }
    case "unemployment": {
      const u = rec(exp.unemployment);
      if (u.eligible === false) {
        return {
          conclusion: `当前就业状态为${f.employmentLabel}，不属于失业保险金领取范围（领取资格：否），核定领取期限${n(u.duration_months)}个月，不产生失业保险金金额。`,
          results: [
            `领取资格：否（就业状态${f.employmentLabel}）`,
            `领取期限：${n(u.duration_months)}个月`,
            `月领取标准：${n(u.monthly_amount_est)}元（不适用）`,
          ],
          question:
            f.employment === "employed"
              ? `我是${birthPhrase}，目前${where}在单位在职参保，如果现在咨询失业保险金，我是否符合领取条件？`
              : `我是${birthPhrase}，${where}以灵活就业身份参保，现在能否申领失业保险金？`,
          titleSuffix: "（规则不适用）",
        };
      }
      const stageLine = has(u.benefit_stage) ? `当前处于第${n(u.benefit_stage)}个月领取阶段，对应标准${n(u.monthly_amount_est)}元/月。` : "";
      return {
        conclusion: `符合失业保险金领取条件（失业保险累计缴费${n(f.social.unemployment_insurance_years)}年），核定领取期限${n(u.duration_months)}个月。${stageLine}`,
        results: [
          `领取资格：是`,
          `核定领取期限：${n(u.duration_months)}个月`,
          `当前领取阶段：第${n(u.benefit_stage)}个月`,
          `本阶段月领取标准：${n(u.monthly_amount_est)}元`,
        ],
        question: `我是${birthPhrase}，${where}失业前失业保险累计缴了${n(f.social.unemployment_insurance_years)}年，正在领取失业保险金${has(f.social.ui_claimed_months) ? `、已领${n(f.social.ui_claimed_months)}个月` : ""}，一共能领多长时间？现在这一阶段每月多少钱？`,
        titleSuffix: "",
      };
    }
    case "flexible": {
      const fx = rec(exp.flex);
      if (fx.applicable !== true) {
        return {
          conclusion: `当前就业状态为${f.employmentLabel}，灵活就业人员缴费规则不适用（适用：否），不生成灵活就业月缴费金额。`,
          results: [`灵活就业缴费规则适用：否（就业状态${f.employmentLabel}）`],
          question: `我是${birthPhrase}，目前${where}${employedPhrase}，灵活就业人员的养老、医保缴费标准对我适用吗？`,
          titleSuffix: "（规则不适用）",
        };
      }
      return {
        conclusion: `以本人选择的月缴费基数${n(fx.contrib_base)}元测算：养老保险${n(fx.pension_monthly)}元/月、职工医保${n(fx.medical_monthly)}元/月，合计${n(fx.total_monthly)}元/月。`,
        results: [
          `采用缴费基数：${n(fx.contrib_base)}元/月`,
          `养老保险月缴费：${n(fx.pension_monthly)}元`,
          `职工医保月缴费：${n(fx.medical_monthly)}元`,
          `合计月缴费：${n(fx.total_monthly)}元`,
        ],
        question: `我是${birthPhrase}，${where}灵活就业，选择按${n(f.social.flex_contrib_base)}元/月的基数参保，每月养老和医保分别要交多少、合计多少？`,
        titleSuffix: "",
      };
    }
    case "subsidy": {
      const s = rec(exp.subsidy);
      const sel = String(s.selected_option ?? "");
      if (sel === "4050") {
        return {
          conclusion: `已认定就业困难人员且以灵活就业身份缴费，符合灵活就业社会保险补贴（4050）条件；按缴费基数下限口径估算补贴${n(s["4050_amount_est"])}元/月，规则引擎选择：4050。`,
          results: [
            `灵活就业社保补贴（4050）资格：是`,
            `估算补贴金额：${n(s["4050_amount_est"])}元/月`,
            `用人单位岗位补贴资格：${n(s.job_eligible)}`,
            `补贴选择：4050`,
          ],
          question: `我是${birthPhrase}，已被认定为就业困难人员，现在${where}灵活就业并按${n(f.social.flex_contrib_base)}元基数缴费，距法定退休还有${n(f.subsidy.months_to_legal_retire)}个月，我能享受哪种社保补贴、每月大约多少？`,
          titleSuffix: "",
        };
      }
      if (sel === "job_subsidy") {
        return {
          conclusion: `已认定就业困难人员并被用人单位吸纳就业，符合用人单位岗位补贴条件，按月最低工资口径估算补贴${n(s.job_amount_est)}元/月，规则引擎选择：用人单位岗位补贴。`,
          results: [
            `用人单位岗位补贴资格：是`,
            `估算岗位补贴：${n(s.job_amount_est)}元/月`,
            `灵活就业社保补贴资格：${n(s["4050_eligible"])}`,
            `补贴选择：用人单位岗位补贴（job_subsidy）`,
          ],
          question: `我是${birthPhrase}，属于就业困难人员，现在被${where === "在上海" ? "上海" : "广东"}一家单位吸纳就业，距法定退休还有${n(f.subsidy.months_to_legal_retire)}个月，单位或我本人能享受什么补贴？`,
          titleSuffix: "",
        };
      }
      if (sel === "older_ui_pension_fund") {
        return {
          conclusion: `正在领取失业保险金且距法定退休${n(f.subsidy.months_to_legal_retire)}个月，处于大龄领取失业保险金人员窗口，符合由失业保险基金支付其参加职工养老、医保费用的条件；未认定就业困难人员，灵活就业社保补贴与岗位补贴不适用。`,
          results: [
            `大龄领金人员基金支付资格：是`,
            `灵活就业社保补贴资格：${n(s["4050_eligible"])}`,
            `用人单位岗位补贴资格：${n(s.job_eligible)}`,
            `补贴选择：大龄领金人员基金支付（older_ui_pension_fund）`,
          ],
          question: `我是${birthPhrase}，正在${where.replace("在", "")}领取失业保险金，距法定退休只有${n(f.subsidy.months_to_legal_retire)}个月，没有做就业困难人员认定，还能享受哪类补贴或由基金支付的待遇？`,
          titleSuffix: "",
        };
      }
      return {
        conclusion: `按当前输入，规则引擎的补贴选择结果为：${n(s.selected_option)}。`,
        results: [
          `灵活就业社保补贴资格：${n(s["4050_eligible"])}`,
          `用人单位岗位补贴资格：${n(s.job_eligible)}`,
          `大龄领金人员基金支付资格：${n(s.older_ui_pension_fund_eligible)}`,
          `补贴选择：${n(s.selected_option)}`,
        ],
        question: `我是${birthPhrase}，${where}${employedPhrase}，距法定退休${n(f.subsidy.months_to_legal_retire)}个月，能享受哪类就业困难人员补贴？`,
        titleSuffix: sel === "conflict" || sel === "" ? "（需补充信息）" : "",
      };
    }
    // ─── 广东 ───────────────────────────────────────────────────────────────
    case "ui-amount": {
      const u = rec(exp.unemployment);
      const code = String(f.profile.claim_city_code ?? "");
      const city = GD_CLAIM_CITY_CODE_TO_NAME[code] ?? code;
      return {
        conclusion: `符合失业保险金领取条件（失业保险累计缴费${n(f.social.unemployment_insurance_years)}年），核定领取期限${n(u.duration_months)}个月；领取地市为${city}（${code}），按当地月最低工资的法定比例核定失业保险金${n(u.monthly_amount_est)}元/月。`,
        results: [
          `领取资格：是`,
          `核定领取期限：${n(u.duration_months)}个月`,
          `领取地市：${city}（${code}）`,
          `月领取标准：${n(u.monthly_amount_est)}元`,
        ],
        question: `我在广东参保，失业保险累计缴了${n(f.social.unemployment_insurance_years)}年，失业后打算在${city}（${code}）申领，每月能领多少失业保险金、能领几个月？`,
        titleSuffix: `（${city}领取）`,
      };
    }
    case "claim-city-missing": {
      const u = rec(exp.unemployment);
      return {
        conclusion: `符合失业保险金领取条件（失业保险累计缴费${n(f.social.unemployment_insurance_years)}年），核定领取期限${n(u.duration_months)}个月；但未提供领取地市代码，无法确定当地月最低工资标准，规则引擎不估算金额，需补充领取地市后再测算。`,
        results: [
          `领取资格：是`,
          `核定领取期限：${n(u.duration_months)}个月`,
          `月领取标准：${NOT_ESTIMATED}（缺领取地市）`,
        ],
        question: `我在广东失业，失业保险累计缴了${n(f.social.unemployment_insurance_years)}年，还没确定在哪个市申领失业保险金，现在能算出每月领多少吗？`,
        titleSuffix: "（缺领取地市）",
      };
    }
    case "mi-2030": {
      const mi = rec(exp.mi);
      const r = rec(exp.retirement);
      return {
        conclusion: `按广东省自${d.asOfDate}起执行的省级统一口径，${f.genderLabel}退休时享受职工医保待遇所需累计缴费${n(mi.lifetime_required_months)}个月；当前累计${n(f.social.medical_contrib_months)}个月，缺口${n(mi.lifetime_gap_months)}个月；法定退休年龄${n(r.legal_retire_age_years)}岁。`,
        results: [
          `退休所需累计缴费（省级统一口径）：${n(mi.lifetime_required_months)}个月`,
          `当前累计缴费（输入）：${n(f.social.medical_contrib_months)}个月`,
          `年限缺口：${n(mi.lifetime_gap_months)}个月`,
          `法定退休年龄：${n(r.legal_retire_age_years)}岁`,
        ],
        question: `我是${birthPhrase}，在广东参保，职工医保累计缴了${n(f.social.medical_contrib_months)}个月。按${d.asOfDate}起执行的省级统一口径，退休时医保需要累计缴多少个月、我还差多少？`,
        titleSuffix: "（省级统一口径）",
      };
    }
    case "mi-2026-missing": {
      const r = rec(exp.retirement);
      return {
        conclusion: `当前计算时点省级统一医保退休年限尚未生效，参保地市执行年限参数缺失，规则引擎不给出退休医保年限结论（需补充参保地市口径确认）；法定退休年龄${n(r.legal_retire_age_years)}岁可确定。`,
        results: [
          `退休医保所需年限：${NOT_ESTIMATED}（地市年限参数缺失）`,
          `当前累计缴费（输入）：${n(f.social.medical_contrib_months)}个月`,
          `法定退休年龄：${n(r.legal_retire_age_years)}岁`,
        ],
        question: `我是${birthPhrase}，在广东参保，职工医保累计缴了${n(f.social.medical_contrib_months)}个月，现在能确定退休时需要缴满多少年吗？`,
        titleSuffix: "（地市年限缺参）",
      };
    }
    case "base-boundary": {
      const r = rec(exp.retirement);
      return {
        conclusion: `本人选择的灵活就业缴费基数为${n(f.social.flex_contrib_base)}元/月；当前规则引擎未配置广东灵活就业月缴费金额规则，不计算具体缴费金额，缴费基数是否落在参保地市下限与省上限之间请以政策依据为准；同时参保地市医保退休年限参数缺失，需补充确认；法定退休年龄${n(r.legal_retire_age_years)}岁可确定。`,
        results: [
          `本人选择的缴费基数（输入）：${n(f.social.flex_contrib_base)}元/月`,
          `灵活就业月缴费金额：${NOT_ESTIMATED}（广东无专属缴费规则）`,
          `法定退休年龄：${n(r.legal_retire_age_years)}岁`,
        ],
        question: `我是${birthPhrase}，在广东灵活就业，想按${n(f.social.flex_contrib_base)}元/月的基数参保，这个基数可以吗、每月要交多少？`,
        titleSuffix: "（缴费基数边界）",
      };
    }
    default:
      throw new Error(`未知能力：${d.capability}`);
  }
}

function questionsOf(exp: Record<string, unknown>): Array<{ question_id: string; field: string; text: string }> {
  const raw = exp.agent_questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q) => q !== null && typeof q === "object")
    .map((q) => {
      const r = q as Record<string, unknown>;
      return {
        question_id: String(r.question_id ?? ""),
        field: String(r.field ?? ""),
        text: String(r.text ?? ""),
      };
    });
}

function warningsOf(exp: Record<string, unknown>): Array<{ warning_id: string; text: string }> {
  const details = exp.warning_details;
  if (Array.isArray(details)) {
    return details
      .filter((w) => w !== null && typeof w === "object")
      .map((w) => {
        const r = w as Record<string, unknown>;
        return { warning_id: String(r.warning_id ?? ""), text: String(r.text ?? "") };
      });
  }
  return Array.isArray(exp.warnings) ? exp.warnings.map((w) => ({ warning_id: String(w), text: "" })) : [];
}

/** 政策依据按文档分组：同一文件的多条定位合并为一行。 */
function groupSources(sources: PolicySource[]): string[] {
  const order: string[] = [];
  const byDoc = new Map<string, { title: string; authority: string; locators: string[] }>();
  for (const p of sources) {
    let g = byDoc.get(p.documentId);
    if (!g) {
      g = { title: p.title, authority: p.authority, locators: [] };
      byDoc.set(p.documentId, g);
      order.push(p.documentId);
    }
    const loc = `${p.locator.type}/${p.locator.reference}`;
    if (!g.locators.includes(loc)) g.locators.push(loc);
  }
  return order.map((id) => {
    const g = byDoc.get(id)!;
    return `- 《${g.title}》（${g.authority}）— 定位：${g.locators.join("；")}`;
  });
}

/** 渲染标题、问题、回答、case_text、topics与category（全部字段确定性）。 */
export function renderScenarioContent(d: ScenarioDraftV2): RenderedContentV2 {
  const f = facts(d);
  const nar = narrative(d);
  const capLabel = CAPABILITY_LABELS[d.capability] ?? d.capability;
  const needsAgent = d.expected.needs_agent === true;
  const questions = questionsOf(d.expected);
  const warnings = warningsOf(d.expected);
  const persona = describePersona(d);

  const title = `${f.region}${capLabel}案例：${n(f.basic.birth_year)}年生${f.genderLabel}·${f.employmentLabel}${nar.titleSuffix}`;

  const sources = groupSources(d.policySources);

  const missing: string[] = [];
  if (needsAgent) {
    for (const q of questions) missing.push(`- 需补充字段 ${q.field}：${q.text}`);
    if (missing.length === 0) missing.push("- 规则引擎标记需人工确认，但未生成具体追问。");
  }
  for (const w of warnings) {
    if (w.warning_id === "W-NEEDS-AGENT") continue;
    missing.push(`- 规则提示（需确认）：${w.text ? `${w.text}（${w.warning_id}）` : w.warning_id}`);
  }
  if (missing.length === 0) missing.push("- 无。本案例输入完整，结论为确定性计算结果。");

  const aiResponse = [
    `【结论摘要】`,
    nar.conclusion,
    ``,
    `【关键测算结果】`,
    ...nar.results.map((r) => `- ${r}`),
    ``,
    `【使用的个人条件】`,
    ...persona.map((p) => `- ${p}`),
    ``,
    `【政策依据】`,
    ...(sources.length > 0 ? sources : ["- （无）"]),
    ``,
    `【缺失或需确认事项】`,
    ...missing,
    ``,
    `【声明】${SYNTHETIC_DISCLAIMER}。本回答由规则引擎按${d.asOfDate}有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。`,
  ].join("\n");

  const caseText = [
    `# ${title}`,
    ``,
    `> ${SYNTHETIC_CASE_LABEL}：本案例由规则引擎按确定性模板生成，人物为合成画像，不含任何真实个人数据；${SYNTHETIC_DISCLAIMER}。`,
    ``,
    `## 合成人物条件`,
    ``,
    ...persona.map((p) => `- ${p}`),
    ``,
    `## 咨询目标`,
    ``,
    nar.question,
    ``,
    `## 计算时点`,
    ``,
    `政策参数与规则按 as-of 日期 ${d.asOfDate} 的生效版本执行；结论只在该时点与上述输入条件下成立。`,
    ``,
    `## 规则引擎结论`,
    ``,
    nar.conclusion,
    ``,
    ...nar.results.map((r) => `- ${r}`),
    ``,
    `## 结论边界与风险提示`,
    ``,
    `- 结论级别：${needsAgent ? "需人工补充确认（needs_agent）" : "确定性结论"}；输入条件或政策参数变化后必须重新测算。`,
    ...missing,
    `- ${SYNTHETIC_DISCLAIMER}；办理以经办机构核定为准。`,
    ``,
  ].join("\n");

  return {
    title,
    userMessage: nar.question,
    aiResponse,
    caseText,
    topics: ["社保规划", f.region, capLabel, SYNTHETIC_CASE_LABEL],
    category: capLabel,
  };
}
