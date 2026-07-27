// User profile types matching user_profile.schema.json

export interface UserProfileBasic {
  birth_year_text?: string | null;
  birth_year?: number | null;
  birth_month?: number | null;
  birth_day?: number | null;
  birth_date?: string | null;
  gender?: "male" | "female" | null;
  female_retire_type?: "worker50" | "cadre55" | "unknown" | null;
  target_city?: string | null;
}

export interface UserProfileSocial {
  pension_contrib_months?: number | null;
  medical_contrib_months?: number | null;
  unemployment_insurance_years?: number | null;
  base_lower_amount_per_month?: number | null;
  min_wage_amount_per_month?: number | null;
  paid_months_in_year?: number[] | null;
}

export interface UserProfileStatus {
  employment_status?:
    | "employed"
    | "unemployed"
    | "flexible"
    | "retired"
    | "unknown"
    | null;
  on_unemployment_benefit?: boolean | null;
  unemployment_benefit_months_used?: number | null;
  unemployment_benefit_months_remaining?: number | null;
}

export interface UserProfileSubsidy {
  has_employment_difficulty_cert?: boolean | null;
  months_to_legal_retire?: number | null;
}

export interface UserProfileMI {
  prev_end_date?: string | null;
  enroll_date?: string | null;
}

export type UserObjective =
  | "min_cost"
  | "max_pension"
  | "keep_medical"
  | "balanced"
  | null;

export interface UserProfile {
  basic?: UserProfileBasic;
  social?: UserProfileSocial;
  status?: UserProfileStatus;
  subsidy?: UserProfileSubsidy;
  mi?: UserProfileMI;
  objective?: UserObjective;
}
