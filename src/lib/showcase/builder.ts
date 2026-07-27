export interface SourceShowcaseCase {
  case_uid: string;
  input: {
    basic: {
      gender: string;
      birth_year?: number;
      birth_month?: number;
      female_retire_type?: string;
    };
    social?: { pension_contrib_months?: number; pension_contrib_years?: number };
    status?: { employment_status?: string };
  };
  expected: {
    retire_age?: string;
    retire_date?: string;
    min_contrib_years?: number;
    monthly_cost?: number;
    pension_amount?: number;
    subsidy_4050?: boolean;
    subsidy_daling?: boolean;
    subsidy_gangwei?: boolean;
    gap_months?: number;
  };
  case_text_excerpt: string;
}

export interface PreparedShowcaseRow {
  caseUid: string;
  title: string;
  tags: string[];
  userMessage: string;
  aiResponse: string;
  inputData: Record<string, unknown>;
  expectedData: Record<string, unknown>;
  category: string;
  isPublished: boolean;
  sortOrder: number;
  sourceCase: SourceShowcaseCase;
}

export function isFallbackOnly(arguments_: string[]): boolean {
  return arguments_.includes("--fallback-only");
}

export function filterHighQualityCases(records: SourceShowcaseCase[]): SourceShowcaseCase[] {
  return records.filter((record) => record.input.basic.birth_year && record.input.basic.gender && record.expected.retire_age && record.case_text_excerpt.length > 100);
}

function categorize(record: SourceShowcaseCase): string {
  const gender = record.input.basic.gender;
  const birthYear = record.input.basic.birth_year ?? 0;
  const status = record.input.status?.employment_status;
  if (gender === "female" && birthYear >= 1980) return "female_young";
  if (gender === "female" && birthYear >= 1970) return "female_mid";
  if (gender === "female") return "female_old";
  if (gender === "male" && birthYear >= 1975) return "male_young";
  if (gender === "male" && birthYear >= 1965) return "male_mid";
  if (gender === "male") return "male_old";
  if (status === "flexible") return "flexible";
  if (record.expected.subsidy_4050) return "subsidy";
  return "other";
}

function contributionMonths(record: SourceShowcaseCase): number {
  return record.input.social?.pension_contrib_months ?? (record.input.social?.pension_contrib_years ? record.input.social.pension_contrib_years * 12 : 0);
}

function buildTags(record: SourceShowcaseCase): string[] {
  const tags = [record.input.basic.gender === "female" ? "女性" : "男性"];
  if (record.input.basic.birth_year) tags.push(`${record.input.basic.birth_year}年`);
  if (record.input.basic.female_retire_type === "worker50") tags.push("工人50岁");
  if (record.input.basic.female_retire_type === "cadre55") tags.push("管理岗55岁");
  if (record.input.status?.employment_status === "flexible") tags.push("灵活就业");
  if (record.input.status?.employment_status === "unemployed") tags.push("失业");
  if (record.expected.subsidy_4050) tags.push("4050补贴");
  if (record.expected.subsidy_daling) tags.push("大龄补贴");
  if (record.expected.pension_amount) tags.push("养老金估算");
  const months = contributionMonths(record);
  if (months > 0) tags.push(`已缴${Math.round(months / 12)}年`);
  return tags;
}

function buildTitle(record: SourceShowcaseCase): string {
  const gender = record.input.basic.gender === "female" ? "女性" : "男性";
  const parts = [`${record.input.basic.birth_year ?? "?"}年${gender}`];
  if (record.input.status?.employment_status === "flexible") parts.push("灵活就业");
  if (record.input.status?.employment_status === "unemployed") parts.push("失业");
  const months = contributionMonths(record);
  if (months > 0) parts.push(`${Math.round(months / 12)}年工龄`);
  if (record.expected.subsidy_4050) parts.push("4050补贴");
  return parts.join(" · ");
}

function buildUserMessage(record: SourceShowcaseCase): string {
  const gender = record.input.basic.gender === "female" ? "女" : "男";
  let message = `我是${gender}的，${record.input.basic.birth_year}年`;
  if (record.input.basic.birth_month) message += `${record.input.basic.birth_month}月`;
  message += "出生";
  const months = record.input.social?.pension_contrib_months;
  const years = record.input.social?.pension_contrib_years;
  if (months) message += `，养老保险已经交了${Math.round(months / 12)}年`;
  else if (years) message += `，养老保险已经交了${years}年`;
  if (record.input.status?.employment_status === "flexible") message += "，目前灵活就业";
  else if (record.input.status?.employment_status === "unemployed") message += "，目前失业";
  else if (record.input.status?.employment_status === "employed") message += "，目前在职";
  return `${message}，想了解退休规划方案`;
}

function fieldText(value: unknown, missingHint: string): string {
  if (value === null || value === undefined || (typeof value === "string" && value.trim().length === 0)) {
    return `暂无数据（需补充${missingHint}）`;
  }
  return String(value);
}

function moneyText(value: number | undefined, missingHint: string): string {
  return typeof value === "number" && Number.isFinite(value) ? `¥${value.toLocaleString("zh-CN")}` : `暂无数据（需补充${missingHint}）`;
}

export function buildFallbackAiResponse(record: SourceShowcaseCase): string {
  const statusMap: Record<string, string> = { employed: "在职", unemployed: "失业", flexible: "灵活就业", retired: "已退休" };
  const statusKey = record.input.status?.employment_status ?? "unknown";
  const pensionMonths = record.input.social?.pension_contrib_months ?? (record.input.social?.pension_contrib_years ? record.input.social.pension_contrib_years * 12 : undefined);
  const minMonths = typeof record.expected.min_contrib_years === "number" ? Math.max(0, Math.round(record.expected.min_contrib_years * 12)) : undefined;
  const gapMonths = typeof record.expected.gap_months === "number" ? record.expected.gap_months : typeof pensionMonths === "number" && typeof minMonths === "number" ? Math.max(minMonths - pensionMonths, 0) : undefined;
  const subsidies = [record.expected.subsidy_4050 && "- 4050灵活就业补贴：可申请", record.expected.subsidy_daling && "- 大龄补贴：可申请", record.expected.subsidy_gangwei && "- 岗位补贴：可申请"].filter(Boolean).join("\n") || "- 暂无明确补贴资格，建议补充就业困难认定与失业状态信息";
  const action1 = statusKey === "unemployed" ? "30天内先完成失业登记，并核对失业金申领资格。" : "30天内先核对个人累计缴费月数和账户状态。";
  const action2 = statusKey === "flexible" ? "按灵活就业路径连续缴费，避免断缴影响退休办理。" : "根据当前状态确认后续参保路径（在职/灵活就业/失业衔接）。";

  return `**结论**
- ${record.input.basic.gender === "female" ? "女性" : "男性"}${statusMap[statusKey] ?? "状态未说明"}场景下，建议走“先补缺口再锁定退休节点”的稳健路径。

**关键数字**
- 推荐退休节点：${fieldText(record.expected.retire_date, "退休日期")} / ${fieldText(record.expected.retire_age, "退休年龄")}
- 养老已缴：${fieldText(pensionMonths, "养老累计月数")} 个月
- 最低缴费要求：${fieldText(minMonths, "最低缴费年限")} 个月
- 养老缺口：${fieldText(gapMonths, "缴费缺口")}
- 参考月成本：${moneyText(record.expected.monthly_cost, "月缴成本")}
- 参考养老金：${moneyText(record.expected.pension_amount, "养老金预估")}

**你现在要做（0-30天）**
1. ${action1}
2. ${action2}
3. 准备身份证、社保缴费记录，到街道/社保窗口核对口径。

**路径建议**
- 保守路径：先补足养老缺口，再办理退休，优先保障可退休性。
- 均衡路径：补缺口同时评估补贴，兼顾现金流与累计工龄。

**补贴机会**
${subsidies}

**注意事项**
- 本条为脚本回退生成，核心数字来自 case 的 input/expected 数据。
- 政策执行以当地社保经办机构与12333答复为准。`;
}

export function prepareShowcaseRows(records: SourceShowcaseCase[]): PreparedShowcaseRow[] {
  const seen = new Set<string>();
  return filterHighQualityCases(records).flatMap((record) => {
    const key = `${record.input.basic.gender}-${record.input.basic.birth_year}-${record.input.status?.employment_status ?? "unknown"}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      caseUid: record.case_uid,
      title: buildTitle(record),
      tags: buildTags(record),
      userMessage: buildUserMessage(record),
      aiResponse: buildFallbackAiResponse(record),
      inputData: record.input as unknown as Record<string, unknown>,
      expectedData: record.expected as unknown as Record<string, unknown>,
      category: categorize(record),
      isPublished: true,
      sortOrder: 0,
      sourceCase: record,
    }];
  }).map((row, sortOrder) => ({ ...row, sortOrder }));
}
