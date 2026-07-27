import { z } from "zod";

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

export const UserProfileSchema = z.object({
  basic: BasicSchema.optional(),
  social: SocialSchema.optional(),
  status: StatusSchema.optional(),
  subsidy: SubsidySchema.optional(),
  mi: MiSchema.optional(),
  objective: z
    .enum(["min_cost", "max_pension", "keep_medical", "balanced"])
    .nullable()
    .optional(),
});

export const PlanComputeRequestSchema = z.object({
  user: UserProfileSchema,
  as_of_date: z.string().optional(),
  rule_set_id: z.string().optional(),
  policy_pack_id: z.string().optional(),
});

export type PlanComputeRequestInput = z.infer<typeof PlanComputeRequestSchema>;
