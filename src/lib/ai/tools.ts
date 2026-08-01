/**
 * AI Agent 工具定义
 *
 * 使用 Vercel AI SDK v6 的 tool() 函数注册所有工具。
 * v6 API: tool({ description, inputSchema: zodSchema(z.object(...)), execute })
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { computePlanService, type ComputePlanServiceInput, type ComputePlanServiceResult } from "@/lib/engine/plan-service";

// ─── 内部类型 ─────────────────────────────────────────────────────────────────

interface AgentQuestion {
  question_id: string;
  field: string;
  label: string;
  hint?: string;
  options?: { value: string; label: string }[];
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

export const computePlanSchema = z.object({
  basic: z.object({
    birth_year: z
      .number()
      .int()
      .min(1940)
      .max(2010)
      .optional()
      .describe("出生年份（数字），如 1973"),
    birth_year_text: z
      .string()
      .optional()
      .describe("出生年份文本，如 '73年' 或 '1973'，引擎会自动解析"),
    birth_month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe("出生月份，1-12"),
    birth_day: z
      .number()
      .int()
      .min(1)
      .max(31)
      .optional()
      .describe("出生日期，1-31"),
    gender: z.enum(["male", "female"]).describe("性别：male=男，female=女"),
    female_retire_type: z
      .enum(["worker50", "cadre55", "unknown"])
      .optional()
      .describe(
        "女性退休口径：worker50=普通工人（50岁退休），cadre55=管理岗/干部（55岁退休），unknown=不确定",
      ),
    target_city: z.string().optional().describe("目标城市，默认上海"),
    retire_preference: z
      .enum(["earliest", "standard", "latest"])
      .optional()
      .describe(
        "退休偏好：earliest=最早退休（提前最多3年），standard=法定退休，latest=延迟退休（最多3年）",
      ),
  }),
  social: z
    .object({
      pension_contrib_months: z
        .number()
        .int()
        .min(0)
        .max(600)
        .optional()
        .describe("养老保险已缴月数（0-600，最多 50 年）"),
      medical_contrib_months: z
        .number()
        .int()
        .min(0)
        .max(600)
        .optional()
        .describe("医疗保险已缴月数（0-600，最多 50 年）"),
      unemployment_insurance_years: z
        .number()
        .min(0)
        .optional()
        .describe("失业保险已缴年数"),
      min_wage_amount_per_month: z
        .number()
        .optional()
        .describe("当地最低工资标准（元/月）"),
      base_lower_amount_per_month: z
        .number()
        .optional()
        .describe("社保缴费基数下限（元/月）"),
      paid_months_in_year: z
        .array(z.number().int())
        .optional()
        .describe("当年已缴费月份列表，如 [1,2,3,4,5,6,7,8]"),
    })
    .optional(),
  status: z
    .object({
      employment_status: z
        .enum(["employed", "unemployed", "flexible", "retired", "unknown"])
        .optional()
        .describe(
          "就业状态：employed=在职，unemployed=失业，flexible=灵活就业，retired=已退休",
        ),
      on_unemployment_benefit: z
        .boolean()
        .optional()
        .describe("是否正在领取失业金"),
    })
    .optional(),
  subsidy: z
    .object({
      has_employment_difficulty_cert: z
        .boolean()
        .optional()
        .describe("是否持有就业困难人员认定证（4050补贴申请所需）"),
      months_to_legal_retire: z
        .number()
        .int()
        .optional()
        .describe("距法定退休月数（通常由引擎自动计算，无需填写）"),
    })
    .optional(),
  mi: z
    .object({
      prev_end_date: z
        .string()
        .optional()
        .describe("上次医保结束日期，格式 YYYY-MM-DD"),
      enroll_date: z
        .string()
        .optional()
        .describe("本次医保参保日期，格式 YYYY-MM-DD"),
    })
    .optional(),
  objective: z
    .enum(["min_cost", "max_pension", "keep_medical", "balanced"])
    .optional()
    .describe(
      "规划目标：min_cost=最低花费，max_pension=最大养老金，keep_medical=保医保，balanced=均衡",
    ),
});

export const validateFieldSchema = z.object({
  field: z
    .string()
    .describe(
      "字段路径，如 basic.birth_year、basic.gender、social.pension_contrib_months",
    ),
  value: z
    .union([z.string(), z.number(), z.boolean()])
    .describe("用户提供的字段值"),
});

export type ComputePlanInput = z.infer<typeof computePlanSchema>;
type ComputePlanToolOutput = Awaited<ReturnType<ReturnType<typeof createComputePlanToolAdapter>["execute"]>>;
type ValidateFieldInput = z.infer<typeof validateFieldSchema>;

// ─── Tool 1: computePlan ─────────────────────────────────────────────────────

const COMPUTE_PLAN_DESCRIPTION =
  "调用社保规则引擎，根据用户参数计算社保规划方案。当用户提供了足够的个人信息后调用此工具。如果引擎返回 needs_agent=true，说明仍有缺失字段，需要继续追问用户。";

export function createComputePlanToolAdapter(
  service: (input: ComputePlanServiceInput) => Promise<ComputePlanServiceResult>,
  options: { asOfDate?: string; persist?: boolean; captureResult?: (result: ComputePlanServiceResult) => void } = {},
) {
  return {
    parse(input: unknown) {
      return computePlanSchema.safeParse(input);
    },
    async execute(params: ComputePlanInput, context?: { experimental_context?: unknown }) {
      const ctx = context?.experimental_context as { sessionId?: unknown } | undefined;
      const sessionId = typeof ctx?.sessionId === "string" ? ctx.sessionId : undefined;
      try {
        const userInput = { basic: params.basic, social: params.social, status: params.status, subsidy: params.subsidy, mi: params.mi, objective: params.objective };
        const result = await service({ user: userInput, sessionId, asOfDate: options.asOfDate, persist: options.persist });
        options.captureResult?.(result);
        return { success: true as const, plan_id: result.planId, needs_agent: result.needsAgent, questions: result.questions, warnings: result.warnings, caveats: result.caveats, plan: result.plan, calc: result.calc, meta: result.meta };
      } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : "计算服务暂时不可用，请稍后重试", needs_agent: false, questions: [] as AgentQuestion[], warnings: [] as string[], plan: {} as Record<string, unknown>, calc: {} as Record<string, unknown>, meta: null };
      }
    },
  };
}

// ─── Tool 2: validateField ───────────────────────────────────────────────────

const VALIDATE_FIELD_DESCRIPTION =
  "校验用户输入的字段值格式是否正确。在调用 computePlan 之前用于预校验单个字段，避免因格式错误导致计算失败。";

// ─── Tool 3: updateProfile ──────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  basic: z
    .object({
      birth_year: z.number().int().optional(),
      birth_month: z.number().int().optional(),
      gender: z.enum(["male", "female"]).optional(),
      female_retire_type: z.enum(["worker50", "cadre55", "unknown"]).optional(),
      retire_preference: z.enum(["earliest", "standard", "latest"]).optional(),
    })
    .optional(),
  social: z
    .object({
      pension_contrib_months: z.number().int().optional(),
      medical_contrib_months: z.number().int().optional(),
    })
    .optional(),
  status: z
    .object({
      employment_status: z
        .enum(["employed", "unemployed", "flexible", "retired", "unknown"])
        .optional(),
    })
    .optional(),
});

type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

const UPDATE_PROFILE_DESCRIPTION =
  "当从用户对话中提取到新的个人信息时调用此工具，将结构化的用户画像数据发送给客户端。每轮对话最多调用一次，并把该轮识别到的新增字段合并后一次提交。";

// ─── 工具集导出 ──────────────────────────────────────────────────────────────

export function createAgentTools(
  service: (input: ComputePlanServiceInput) => Promise<ComputePlanServiceResult>,
  options: { asOfDate?: string; persist?: boolean; captureResult?: (result: ComputePlanServiceResult) => void } = {},
) {
  return {
    computePlan: tool<ComputePlanInput, ComputePlanToolOutput>({
      description: COMPUTE_PLAN_DESCRIPTION,
      inputSchema: zodSchema(computePlanSchema),
      execute: createComputePlanToolAdapter(service, options).execute,
    }),
    validateField: tool<ValidateFieldInput, ReturnType<typeof validateFieldValue>>({
      description: VALIDATE_FIELD_DESCRIPTION,
      inputSchema: zodSchema(validateFieldSchema),
      execute: async ({ field, value }: ValidateFieldInput) => validateFieldValue(field, value),
    }),
    updateProfile: tool<UpdateProfileInput, { updated: true; profile: UpdateProfileInput }>({
      description: UPDATE_PROFILE_DESCRIPTION,
      inputSchema: zodSchema(updateProfileSchema),
      execute: async (params) => ({ updated: true, profile: params }),
    }),
  };
}

export const tools = createAgentTools(computePlanService);
export const computePlanTool = tools.computePlan;
export const validateFieldTool = tools.validateField;
export const updateProfileTool = tools.updateProfile;

// ─── 内部辅助函数 ─────────────────────────────────────────────────────────────

function validateFieldValue(
  field: string,
  value: string | number | boolean,
): { valid: boolean; error?: string; normalized?: string | number | boolean } {
  switch (field) {
    case "basic.birth_year": {
      const year = Number(value);
      if (!Number.isInteger(year) || year < 1940 || year > 2010) {
        return {
          valid: false,
          error: `出生年份必须是 1940 到 2010 之间的整数，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: year };
    }

    case "basic.birth_month": {
      const month = Number(value);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return {
          valid: false,
          error: `出生月份必须是 1 到 12 之间的整数，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: month };
    }

    case "basic.gender": {
      const genderMap: Record<string, string> = {
        男: "male",
        女: "female",
        male: "male",
        female: "female",
        m: "male",
        f: "female",
      };
      const normalized = genderMap[String(value).toLowerCase()];
      if (!normalized) {
        return {
          valid: false,
          error: `性别必须是"男"或"女"，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized };
    }

    case "basic.female_retire_type": {
      const validValues = ["worker50", "cadre55", "unknown"];
      if (!validValues.includes(String(value))) {
        return {
          valid: false,
          error: `女性退休口径必须是 worker50（普通工人50岁退休）或 cadre55（管理岗/干部55岁退休），您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: String(value) };
    }

    case "social.pension_contrib_months":
    case "social.medical_contrib_months": {
      const months = Number(value);
      if (!Number.isInteger(months) || months < 0 || months > 600) {
        return {
          valid: false,
          error: `缴费月数必须是 0 到 600 之间的整数（最多 50 年），您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: months };
    }

    case "social.unemployment_insurance_years": {
      const years = Number(value);
      if (isNaN(years) || years < 0 || years > 50) {
        return {
          valid: false,
          error: `失业保险缴费年数必须是 0 到 50 之间的数字，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: years };
    }

    case "status.employment_status": {
      const validStatuses = [
        "employed",
        "unemployed",
        "flexible",
        "retired",
        "unknown",
      ];
      if (!validStatuses.includes(String(value))) {
        return {
          valid: false,
          error: `就业状态必须是以下之一：employed（在职）、unemployed（失业）、flexible（灵活就业）、retired（已退休），您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: String(value) };
    }

    case "status.on_unemployment_benefit":
    case "subsidy.has_employment_difficulty_cert": {
      if (typeof value === "boolean") {
        return { valid: true, normalized: value };
      }
      const strVal = String(value).toLowerCase();
      if (["true", "是", "yes", "1"].includes(strVal)) {
        return { valid: true, normalized: true };
      }
      if (["false", "否", "no", "0"].includes(strVal)) {
        return { valid: true, normalized: false };
      }
      return {
        valid: false,
        error: `此字段需要是"是"或"否"，您输入的是 "${value}"`,
      };
    }

    case "objective": {
      const validObjectives = [
        "min_cost",
        "max_pension",
        "keep_medical",
        "balanced",
      ];
      if (!validObjectives.includes(String(value))) {
        return {
          valid: false,
          error: `规划目标必须是以下之一：min_cost（最低花费）、max_pension（最大养老金）、keep_medical（保医保）、balanced（均衡），您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: String(value) };
    }

    default:
      return { valid: true, normalized: value };
  }
}
