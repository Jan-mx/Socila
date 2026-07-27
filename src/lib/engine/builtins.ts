/**
 * Built-in functions for the rule engine.
 * Each function corresponds to a "call" action's "fn" field in the DSL.
 */

type BuiltinFn = (args: Record<string, unknown>) => unknown;

const builtins: Record<string, BuiltinFn> = {
  /**
   * Parse birth year from text.
   * "73年" -> 1973, "1973" -> 1973
   * Two-digit: >=30 -> 1900+, <30 -> 2000+
   */
  parse_birth_year: (args) => {
    const text = String(args.text ?? "").trim();
    if (!text) return null;

    // Remove "年" suffix and other non-numeric chars
    const cleaned = text.replace(/[年岁]/g, "").trim();
    const num = parseInt(cleaned, 10);
    if (isNaN(num)) return null;

    // 4-digit year
    if (num >= 1900 && num <= 2100) return num;

    // 2-digit year
    if (num >= 0 && num < 100) {
      return num >= 30 ? 1900 + num : 2000 + num;
    }

    return num;
  },

  /**
   * Normalize gender to "male"/"female".
   * "男" -> "male", "女" -> "female", "m" -> "male", "f" -> "female"
   */
  normalize_gender: (args) => {
    // R-012 规则用 args.text 传入；历史上 builtin 只读 args.value，导致该规则
    // 调用恒返回 undefined（性别归一化路径失效）。这里同时接受 text / value。
    const raw = args.text ?? args.value;
    const value = String(raw ?? "")
      .trim()
      .toLowerCase();
    const maleValues = ["男", "male", "m", "man"];
    const femaleValues = ["女", "female", "f", "woman"];

    if (maleValues.includes(value)) return "male";
    if (femaleValues.includes(value)) return "female";
    return raw;
  },

  /**
   * Construct a date string YYYY-MM-DD from year, month, day.
   */
  make_date: (args) => {
    const year = Number(args.year);
    const month = Number(args.month ?? 1);
    const day = Number(args.day ?? 1);

    if (isNaN(year)) return null;

    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  },

  /**
   * Add years to a date string, return YYYY-MM-DD.
   */
  date_add_years: (args) => {
    const dateStr = String(args.date ?? "");
    const years = Number(args.years ?? 0);

    const parts = dateStr.split("-");
    if (parts.length < 3) return null;

    const year = parseInt(parts[0], 10) + years;
    const month = parts[1];
    const day = parts[2];

    return `${year}-${month}-${day}`;
  },

  /**
   * Natural (calendar) month-index difference between two dates: ignores the
   * day-of-month. "2025-12-31" to "2026-03-01" = 3 (months Dec→Mar).
   *
   * 注意语义：这是"自然月差"，用于 R-120 计算距法定退休月数（months_to_legal_retire）。
   * 它**不是**"未覆盖整月数"——R-300 医保断缴想要的是后者（同输入应为 2，少算边界月），
   * 二者差 1。R-300 复用本函数会高算 1 个月，详见 golden 测试的 KNOWN_DIVERGENCES。
   * 本函数被 R-120 + 单测锁定为自然月差，切勿改其语义；如需断缴口径应另起一个 day-aware 函数。
   */
  date_diff_months: (args) => {
    const fromStr = String(args.from ?? "");
    const toStr = String(args.to ?? "");

    const fromParts = fromStr.split("-");
    const toParts = toStr.split("-");
    if (fromParts.length < 2 || toParts.length < 2) return 0;

    const fromYear = parseInt(fromParts[0], 10);
    const fromMonth = parseInt(fromParts[1], 10);
    const toYear = parseInt(toParts[0], 10);
    const toMonth = parseInt(toParts[1], 10);

    return (toYear - fromYear) * 12 + (toMonth - fromMonth);
  },

  /**
   * Extract year from date string.
   */
  date_year: (args) => {
    const dateStr = String(args.date ?? "");
    const parts = dateStr.split("-");
    if (parts.length < 1) return null;
    return parseInt(parts[0], 10);
  },

  /**
   * Extract month from date string.
   */
  date_month: (args) => {
    const dateStr = String(args.date ?? "");
    const parts = dateStr.split("-");
    if (parts.length < 2) return null;
    return parseInt(parts[1], 10);
  },

  /**
   * Add years AND months to a date string, return YYYY-MM-DD.
   * Handles month overflow correctly.
   */
  date_add_years_months: (args) => {
    const dateStr = String(args.date ?? "");
    const years = Number(args.years ?? 0);
    const months = Number(args.months ?? 0);

    const parts = dateStr.split("-");
    if (parts.length < 3) return null;

    let year = parseInt(parts[0], 10) + years;
    let month = parseInt(parts[1], 10) + months;
    const day = parseInt(parts[2], 10);

    while (month > 12) {
      month -= 12;
      year += 1;
    }
    while (month < 1) {
      month += 12;
      year -= 1;
    }

    // Clamp the day to the target month's last valid day so we never emit an
    // impossible calendar date (e.g. 2000-01-31 + 1mo -> 2000-02-29, not 02-31;
    // 1960-02-29 + 63y -> 2023-02-28, since 2023 is not a leap year).
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const clampedDay = Math.min(day, lastDayOfMonth);

    return `${year}-${String(month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
  },

  /**
   * Compute delayed retirement age per 2025 State Council policy.
   *
   * Formula:
   * - Male (60→63): +1 month delay per 4 months of birth, starting 1965-01
   * - Female cadre (55→58): +1 month per 4 months of birth, starting 1970-01
   * - Female worker (50→55): +1 month per 2 months of birth, starting 1975-01
   *
   * Returns: { legal_retire_age_years, legal_retire_age_months, original_retire_age_years }
   */
  compute_delayed_retire_age: (args) => {
    const gender = String(args.gender ?? "");
    const femaleType = String(args.female_retire_type ?? "worker50");
    const birthYear = Number(args.birth_year ?? 0);
    const birthMonth = Number(args.birth_month ?? 1);

    if (!gender || !birthYear) return null;

    let originalAge: number;
    let targetAge: number;
    let startYear: number;
    let startMonth: number;
    let monthsPerDelay: number;

    if (gender === "male") {
      originalAge = 60;
      targetAge = 63;
      startYear = 1965;
      startMonth = 1;
      monthsPerDelay = 4;
    } else if (femaleType === "cadre55") {
      originalAge = 55;
      targetAge = 58;
      startYear = 1970;
      startMonth = 1;
      monthsPerDelay = 4;
    } else {
      originalAge = 50;
      targetAge = 55;
      startYear = 1975;
      startMonth = 1;
      monthsPerDelay = 2;
    }

    const maxDelayMonths = (targetAge - originalAge) * 12;

    const birthIndex =
      (birthYear - startYear) * 12 + (birthMonth - startMonth);

    if (birthIndex < 0) {
      return {
        legal_retire_age_years: originalAge,
        legal_retire_age_months: 0,
        original_retire_age_years: originalAge,
      };
    }

    const delayMonths = Math.min(
      maxDelayMonths,
      Math.max(0, Math.ceil((birthIndex + 1) / monthsPerDelay)),
    );

    const totalMonths = originalAge * 12 + delayMonths;
    const retireYears = Math.floor(totalMonths / 12);
    const retireMonths = totalMonths % 12;

    return {
      legal_retire_age_years: retireYears,
      legal_retire_age_months: retireMonths,
      original_retire_age_years: originalAge,
    };
  },
};

export function getBuiltinFunction(name: string): BuiltinFn | null {
  return builtins[name] ?? null;
}

export function listBuiltinFunctions(): string[] {
  return Object.keys(builtins);
}
