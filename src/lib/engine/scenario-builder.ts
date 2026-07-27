/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RuleDefinition } from "@/types/engine";
import type { OrchestratorResult } from "./orchestrator";
import { orchestrateInMemory } from "./orchestrator";
import { getDeep } from "./actions";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScenarioPhase {
  from_age: number;
  to_age: number;
  action: string;
  /** Positive = cost to user, negative = income/savings */
  monthly_amount?: number;
  total_amount?: number;
  notes?: string;
}

export interface Scenario {
  scenario_id: string;
  label: string;
  retire_age: number;
  retire_age_months: number;
  retire_date: string | null;
  total_contrib_cost: number | null;
  est_monthly_pension: number | null;
  subsidy_savings: number | null;
  pension_gap_months: number | null;
  phases: ScenarioPhase[];
}

// ─── Scenario Configuration ──────────────────────────────────────────────────

interface ScenarioVariant {
  scenario_id: string;
  label: string;
  female_retire_type?: string;
  retire_preference: string;
}

function getScenarioVariants(
  gender: string,
  femaleRetireType?: string,
): ScenarioVariant[] {
  if (gender === "female") {
    if (femaleRetireType === "cadre55") {
      return [
        {
          scenario_id: "S-FEMALE-CADRE-55",
          label: "55岁退休",
          female_retire_type: "cadre55",
          retire_preference: "earliest",
        },
        {
          scenario_id: "S-FEMALE-CADRE-58",
          label: "58岁退休",
          female_retire_type: "cadre55",
          retire_preference: "latest",
        },
      ];
    }
    // Default: worker50
    return [
      {
        scenario_id: "S-FEMALE-WORKER-50",
        label: "50岁退休",
        female_retire_type: "worker50",
        retire_preference: "earliest",
      },
      {
        scenario_id: "S-FEMALE-WORKER-55",
        label: "55岁退休",
        female_retire_type: "worker50",
        retire_preference: "latest",
      },
    ];
  }

  // Male
  return [
    {
      scenario_id: "S-MALE-60",
      label: "60岁退休",
      retire_preference: "earliest",
    },
    {
      scenario_id: "S-MALE-63",
      label: "63岁退休",
      retire_preference: "latest",
    },
  ];
}

// ─── Main Entry ──────────────────────────────────────────────────────────────

/**
 * Build comparison scenarios by re-running the engine with different
 * retire_preference / female_retire_type variants.
 *
 * Performance target: <50ms for 3 scenarios (in-memory, no DB).
 */
export function buildScenarios(
  baseResult: OrchestratorResult,
  effectiveRules: RuleDefinition[],
  flatParams: Record<string, unknown>,
  userInput: Record<string, unknown>,
  asOfDate: string,
): Scenario[] {
  const gender = getDeep(userInput, "basic.gender") as string | undefined;
  if (!gender) return [];

  const femaleRetireType = getDeep(userInput, "basic.female_retire_type") as
    | string
    | undefined;
  const variants = getScenarioVariants(gender, femaleRetireType);

  const scenarios: Scenario[] = [];

  for (const variant of variants) {
    // Clone userInput and apply variant overrides
    const clonedInput = structuredClone(userInput) as any;
    if (!clonedInput.basic) clonedInput.basic = {};

    if (variant.female_retire_type) {
      clonedInput.basic.female_retire_type = variant.female_retire_type;
    }
    clonedInput.basic.retire_preference = variant.retire_preference;

    // Re-run engine in memory
    const result = orchestrateInMemory(
      effectiveRules,
      flatParams,
      clonedInput,
      asOfDate,
    );

    const scenario = extractScenario(
      variant.scenario_id,
      variant.label,
      result,
      clonedInput,
      asOfDate,
    );
    scenarios.push(scenario);
  }

  return scenarios;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractScenario(
  scenarioId: string,
  label: string,
  result: {
    plan: Record<string, unknown>;
    calc: Record<string, unknown>;
    user: Record<string, unknown>;
  },
  userInput: any,
  asOfDate: string,
): Scenario {
  const calc = result.calc;

  const retireAgeYears = (getDeep(calc, "retirement.legal_retire_age_years") ??
    0) as number;
  const retireAgeMonths = (getDeep(
    calc,
    "retirement.legal_retire_age_months",
  ) ?? 0) as number;
  const retireDate = (getDeep(calc, "retirement.legal_retire_date") ?? null) as
    | string
    | null;

  const pensionGapMonths = (getDeep(calc, "pension.gap_months") ?? null) as
    | number
    | null;
  const subsidyAmount = (getDeep(calc, "subsidy.4050_amount_est") ?? null) as
    | number
    | null;
  const flexCost = (getDeep(calc, "subsidy.flex_cost_est") ?? null) as
    | number
    | null;

  // Estimate total contribution cost
  let totalContribCost: number | null = null;
  if (pensionGapMonths != null && flexCost != null) {
    totalContribCost = pensionGapMonths * flexCost;
  }

  // Estimate subsidy savings
  let subsidySavings: number | null = null;
  if (subsidyAmount != null && pensionGapMonths != null) {
    // Subsidy covers up to 36 months (3 years) typically
    const subsidyMonths = Math.min(pensionGapMonths, 36);
    subsidySavings = subsidyAmount * subsidyMonths;
  }

  // Build timeline phases
  const phases = buildPhases(calc, userInput, asOfDate);

  return {
    scenario_id: scenarioId,
    label,
    retire_age: retireAgeYears,
    retire_age_months: retireAgeMonths,
    retire_date: retireDate,
    total_contrib_cost: totalContribCost,
    est_monthly_pension: null, // Pension estimation requires actuarial data not in current rules
    subsidy_savings: subsidySavings,
    pension_gap_months: pensionGapMonths,
    phases,
  };
}

function buildPhases(
  calc: Record<string, unknown>,
  userInput: any,
  asOfDate: string,
): ScenarioPhase[] {
  const phases: ScenarioPhase[] = [];
  const birthYear = getDeep(userInput, "basic.birth_year") as number;
  if (!birthYear) return phases;

  const asOfYear = parseInt(asOfDate.split("-")[0], 10);
  const currentAge = asOfYear - birthYear;

  const retireAgeYears = (getDeep(calc, "retirement.legal_retire_age_years") ??
    0) as number;
  if (!retireAgeYears) return phases;

  const unemploymentEligible = getDeep(
    calc,
    "unemployment.eligible",
  ) as boolean;
  const unemploymentDuration = (getDeep(calc, "unemployment.duration_months") ??
    0) as number;
  const subsidy4050Eligible = getDeep(calc, "subsidy.4050_eligible") as boolean;
  const flexCost = (getDeep(calc, "subsidy.flex_cost_est") ?? null) as
    | number
    | null;
  const subsidyAmount = (getDeep(calc, "subsidy.4050_amount_est") ?? null) as
    | number
    | null;
  const employmentStatus = getDeep(
    userInput,
    "status.employment_status",
  ) as string;

  let phaseAge = currentAge;

  // Phase 1: If unemployed and eligible for unemployment insurance
  if (
    employmentStatus === "unemployed" &&
    unemploymentEligible &&
    unemploymentDuration > 0
  ) {
    const uiYears = Math.ceil(unemploymentDuration / 12);
    const toAge = Math.min(phaseAge + uiYears, retireAgeYears);
    phases.push({
      from_age: phaseAge,
      to_age: toAge,
      action: "领取失业金",
      notes: `失业保险金 ${unemploymentDuration} 个月`,
    });
    phaseAge = toAge;
  }

  // Phase 2: Flexible employment contribution (fill gap to retirement)
  if (phaseAge < retireAgeYears) {
    const monthlyCost = flexCost ?? 0;
    const netCost =
      subsidy4050Eligible && subsidyAmount
        ? monthlyCost - subsidyAmount
        : monthlyCost;

    phases.push({
      from_age: phaseAge,
      to_age: retireAgeYears,
      action:
        subsidy4050Eligible && subsidyAmount
          ? "灵活就业缴费（含4050补贴）"
          : "灵活就业缴费",
      monthly_amount: netCost > 0 ? netCost : undefined,
      total_amount:
        netCost > 0 ? netCost * (retireAgeYears - phaseAge) * 12 : undefined,
      notes: subsidy4050Eligible
        ? `4050补贴约 ¥${subsidyAmount}/月`
        : undefined,
    });
    phaseAge = retireAgeYears;
  }

  // Phase 3: Retirement
  phases.push({
    from_age: retireAgeYears,
    to_age: retireAgeYears,
    action: "办理退休手续，开始领取养老金",
  });

  return phases;
}
