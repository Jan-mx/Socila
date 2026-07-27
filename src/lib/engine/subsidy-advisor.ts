import { getDeep } from "./actions";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubsidyRecommendation {
  subsidy_name: string;
  eligible: boolean | null;
  prerequisites: string[];
  timing: string;
  estimated_amount: number | null;
  action_steps: string[];
}

// ─── Main Entry ──────────────────────────────────────────────────────────────

/**
 * Scan calc.subsidy.* and calc.unemployment.* fields to produce
 * a list of all subsidies the user may be eligible for,
 * with prerequisites, timing, and action steps.
 */
export function adviseSubsidies(
  calc: Record<string, unknown>,
  user: Record<string, unknown>,
): SubsidyRecommendation[] {
  const recommendations: SubsidyRecommendation[] = [];

  recommendations.push(check4050(calc, user));
  recommendations.push(checkJobSubsidy(calc, user));
  recommendations.push(checkOlderUIPensionFund(calc));
  recommendations.push(checkUnemploymentBenefit(calc, user));

  return recommendations;
}

// ─── Individual Subsidy Checks ───────────────────────────────────────────────

function check4050(
  calc: Record<string, unknown>,
  user: Record<string, unknown>,
): SubsidyRecommendation {
  const eligible = getDeep(calc, "subsidy.4050_eligible") as
    | boolean
    | null
    | undefined;
  const amountEst = getDeep(calc, "subsidy.4050_amount_est") as
    | number
    | null
    | undefined;
  const hasCert = getDeep(user, "subsidy.has_employment_difficulty_cert") as
    | boolean
    | undefined;
  const status = getDeep(user, "status.employment_status") as
    | string
    | undefined;

  const prerequisites: string[] = [];
  if (!hasCert) {
    prerequisites.push("需先申请「就业困难人员」认定");
  }
  if (status !== "flexible" && status !== "unemployed") {
    prerequisites.push("需为灵活就业或失业状态");
  }
  prerequisites.push("以灵活就业身份参加社保");

  const actionSteps = [
    "携带身份证、户口本前往户籍所在街道就业服务机构",
    "申请「就业困难人员」认定（一般1-2周）",
    "认定通过后，办理灵活就业参保登记",
    "向街道申请4050社保补贴",
    "补贴按季度/半年发放，需按时续期",
  ];

  return {
    subsidy_name: "4050灵活就业社保补贴",
    eligible: eligible ?? null,
    prerequisites,
    timing: "认定通过后即可申请，一般最长3年，距退休5年内可延至退休",
    estimated_amount: amountEst ?? null,
    action_steps: actionSteps,
  };
}

function checkJobSubsidy(
  calc: Record<string, unknown>,
  user: Record<string, unknown>,
): SubsidyRecommendation {
  const eligible = getDeep(calc, "subsidy.job_eligible") as
    | boolean
    | null
    | undefined;
  const monthsToRetire = getDeep(user, "subsidy.months_to_legal_retire") as
    | number
    | null;

  const prerequisites: string[] = [
    "持有「就业困难人员」认定证",
    "距法定退休年龄不超过36个月",
    "与用人单位签订劳动合同并缴纳社保",
  ];

  const actionSteps = [
    "确认距退休不超过36个月",
    "求职并签订劳动合同",
    "由用人单位申请岗位补贴",
    "补贴发放给用人单位，间接降低就业门槛",
  ];

  let timing = "距退休36个月内可申请";
  if (monthsToRetire != null) {
    if (monthsToRetire <= 36) {
      timing = `当前距退休 ${monthsToRetire} 个月，已在窗口期内`;
    } else {
      const waitMonths = monthsToRetire - 36;
      timing = `距退休 ${monthsToRetire} 个月，还需等 ${waitMonths} 个月进入窗口期`;
    }
  }

  return {
    subsidy_name: "大龄岗位补贴（4757）",
    eligible: eligible ?? null,
    prerequisites,
    timing,
    estimated_amount: null,
    action_steps: actionSteps,
  };
}

function checkOlderUIPensionFund(
  calc: Record<string, unknown>,
): SubsidyRecommendation {
  const eligible = getDeep(calc, "subsidy.older_ui_pension_fund_eligible") as
    | boolean
    | null
    | undefined;

  const prerequisites: string[] = [
    "领取失业金期间",
    "距法定退休年龄不足1年",
    "养老保险缴费不足最低年限",
  ];

  const actionSteps = [
    "在领取失业金期间，由社保经办机构自动评估",
    "符合条件的，失业保险基金代缴养老保险至退休",
    "无需单独申请，但建议主动向窗口确认资格",
  ];

  return {
    subsidy_name: "大龄失业人员养老保险基金代缴",
    eligible: eligible ?? null,
    prerequisites,
    timing: "领取失业金期间且距退休不足1年时自动评估",
    estimated_amount: null,
    action_steps: actionSteps,
  };
}

function checkUnemploymentBenefit(
  calc: Record<string, unknown>,
  user: Record<string, unknown>,
): SubsidyRecommendation {
  const eligible = getDeep(calc, "unemployment.eligible") as
    | boolean
    | null
    | undefined;
  const durationMonths = getDeep(calc, "unemployment.duration_months") as
    | number
    | null
    | undefined;
  const status = getDeep(user, "status.employment_status") as
    | string
    | undefined;

  const prerequisites: string[] = [
    "非因本人意愿中断就业（非主动辞职）",
    "失业保险缴费满1年",
    "已办理失业登记并有求职要求",
  ];

  const actionSteps = [
    "离职后60日内到户籍所在街道办理失业登记",
    "携带解除劳动关系证明、身份证、社保卡",
    "在上海人社APP或窗口申请失业保险金",
    "按月领取，期间医保由失业基金代缴",
  ];

  let timing = "失业后60日内申请";
  if (status === "unemployed") {
    timing = "当前失业状态，尽快申请";
  }

  return {
    subsidy_name: "失业保险金",
    eligible: eligible ?? null,
    prerequisites,
    timing,
    estimated_amount: durationMonths != null ? durationMonths : null,
    action_steps: actionSteps,
  };
}
