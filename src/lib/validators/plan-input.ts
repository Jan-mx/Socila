import { z } from "zod";

/** 稳定地区代码（JRP-FR-002：CN 或 6 位行政区划代码）。 */
const JURISDICTION_CODE_PATTERN = /^(CN|\d{6})$/;

/** 六位地级市行政代码（JRP-FR-022：claim_city_code）。 */
const CLAIM_CITY_CODE_PATTERN = /^\d{6}$/;

const BasicSchema = z.object({
  birth_year_text: z.string().nullable().optional(),
  birth_year: z.number().int().nullable().optional(),
  birth_month: z.number().int().nullable().optional(),
  birth_day: z.number().int().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  female_retire_type: z
    .enum(["worker50", "cadre55", "unknown"])
    .nullable()
    .optional(),
  target_city: z.string().nullable().optional(),
});

const SocialSchema = z.object({
  pension_contrib_months: z.number().int().nullable().optional(),
  medical_contrib_months: z.number().int().nullable().optional(),
  unemployment_insurance_years: z.number().nullable().optional(),
  base_lower_amount_per_month: z.number().nullable().optional(),
  min_wage_amount_per_month: z.number().nullable().optional(),
  paid_months_in_year: z.array(z.number().int()).nullable().optional(),
});

const StatusSchema = z.object({
  employment_status: z
    .enum(["employed", "unemployed", "flexible", "retired", "unknown"])
    .nullable()
    .optional(),
  on_unemployment_benefit: z.boolean().nullable().optional(),
  unemployment_benefit_months_used: z.number().int().nullable().optional(),
  unemployment_benefit_months_remaining: z.number().int().nullable().optional(),
});

const SubsidySchema = z.object({
  has_employment_difficulty_cert: z.boolean().nullable().optional(),
  months_to_legal_retire: z.number().int().nullable().optional(),
});

const MiSchema = z.object({
  prev_end_date: z.string().nullable().optional(),
  enroll_date: z.string().nullable().optional(),
});

/**
 * 领取地市画像（JRP-FR-022/023）：对外只接受六位行政代码，服务端确认代码
 * 属于广东启用地级市后转换为规则内部 claim_city 规范名称；自由文本名称
 * （claim_city）不在公开 Schema 中，客户端提交一律被 strict 拒绝（JRP-AC-003/006）。
 */
const ProfileSchema = z.object({
  claim_city_code: z
    .string()
    .regex(CLAIM_CITY_CODE_PATTERN, "领取地市代码必须是六位行政代码")
    .optional(),
});

export const UserProfileSchema = z.object({
  basic: BasicSchema.optional(),
  social: SocialSchema.optional(),
  status: StatusSchema.optional(),
  subsidy: SubsidySchema.optional(),
  mi: MiSchema.optional(),
  profile: ProfileSchema.optional(),
  objective: z
    .enum(["min_cost", "max_pension", "keep_medical", "balanced"])
    .nullable()
    .optional(),
});

export const PlanComputeRequestSchema = z
  .object({
    user: UserProfileSchema,
    // JRP-FR-001：必填地区代码；缺失 → 路由映射 400 JURISDICTION_REQUIRED。
    jurisdiction_code: z.string().regex(JURISDICTION_CODE_PATTERN),
    as_of_date: z.string().optional(),
  })
  // JRP-FR-003：公开请求不得包含 rule_set_id/policy_pack_id/snapshot_id 及任何
  // 未知字段（strict：未知字段拒绝，不得被剥离后继续计算）。
  .strict();

export type PlanComputeRequestInput = z.infer<typeof PlanComputeRequestSchema>;
