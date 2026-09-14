/**
 * 任务3（JRP-FR-022/023、JRP-AC-006）：广东领取地市代码规范化。
 *
 * - 对外只接受经用户确认的六位地级市行政代码（`profile.claim_city_code`）；
 * - 服务端确认代码属于广东启用地级市后，转换为规则内部 `claim_city` 规范名称
 *   （与 `T-GD-MIN-WAGE-BY-CITY` 表的 city 键一致）；
 * - 未知、跨省、未确认代码一律不生成 claim_city——规则按缺失领取地市处理
 *   （needs_agent + 问题），不估算失业金额；自由文本名称不得直接参与计算。
 */

/** 广东21个地级市：行政代码 → 规则内部规范名称（T-GD-MIN-WAGE-BY-CITY 的 city 键）。 */
export const GD_CLAIM_CITY_CODE_TO_NAME: Readonly<Record<string, string>> = {
  "440100": "广州",
  "440200": "韶关",
  "440300": "深圳",
  "440400": "珠海",
  "440500": "汕头",
  "440600": "佛山",
  "440700": "江门",
  "440800": "湛江",
  "440900": "茂名",
  "441200": "肇庆",
  "441300": "惠州",
  "441400": "梅州",
  "441500": "汕尾",
  "441600": "河源",
  "441700": "阳江",
  "441800": "清远",
  "441900": "东莞",
  "442000": "中山",
  "445100": "潮州",
  "445200": "揭阳",
  "445300": "云浮",
};

/** 六位地级市行政代码模式（JRP-FR-022）。 */
export const CLAIM_CITY_CODE_PATTERN = /^\d{6}$/;

export interface ClaimCityNormalizationResult {
  /** 规范化后注入规则的内部名称；null 表示不可用于计算（不估算金额）。 */
  claimCity: string | null;
  /** 稳定问题标识（JRP-AC-006：缺失/未知/跨省只产生稳定问题且不估算）。 */
  issue?: "claim-city-missing" | "claim-city-unknown" | "claim-city-not-gd";
}

/**
 * 服务端规范化领取地市（JRP-FR-023）：
 * - 未提供代码 → missing（不估算）；
 * - 代码不在广东地级市表 → unknown（不估算）；
 * - 地区不是广东 → not-gd：跨省代码对非广东地区无意义（不估算）；
 * - 有效 → 返回规则内部 claim_city 名称。
 */
export function normalizeClaimCityCode(input: {
  jurisdictionCode: string;
  claimCityCode?: string | null;
}): ClaimCityNormalizationResult {
  const code = input.claimCityCode?.trim();
  if (!code) {
    return { claimCity: null, issue: "claim-city-missing" };
  }
  const isGuangdong = input.jurisdictionCode === "440000";
  if (!isGuangdong) {
    return { claimCity: null, issue: "claim-city-not-gd" };
  }
  const name = GD_CLAIM_CITY_CODE_TO_NAME[code];
  if (!name) {
    return { claimCity: null, issue: "claim-city-unknown" };
  }
  return { claimCity: name };
}