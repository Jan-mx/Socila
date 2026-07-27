import { describe, it, expect } from "vitest";
import { getBuiltinFunction, listBuiltinFunctions } from "../builtins";

describe("builtins · parse_birth_year", () => {
  const fn = getBuiltinFunction("parse_birth_year")!;

  it("解析四位年份", () => {
    expect(fn({ text: "1973" })).toBe(1973);
  });

  it("解析带'年'后缀的两位年份（>=30 → 19xx）", () => {
    expect(fn({ text: "73年" })).toBe(1973);
  });

  it("两位年份 <30 → 20xx", () => {
    expect(fn({ text: "05" })).toBe(2005);
  });

  it("空输入返回 null", () => {
    expect(fn({ text: "" })).toBeNull();
    expect(fn({})).toBeNull();
  });

  it("非数字返回 null", () => {
    expect(fn({ text: "abc" })).toBeNull();
  });
});

describe("builtins · normalize_gender", () => {
  const fn = getBuiltinFunction("normalize_gender")!;

  it("中文'男/女' → male/female", () => {
    expect(fn({ value: "男" })).toBe("male");
    expect(fn({ value: "女" })).toBe("female");
  });

  it("英文别名归一", () => {
    expect(fn({ value: "M" })).toBe("male");
    expect(fn({ value: "female" })).toBe("female");
  });

  it("无法识别时原样返回", () => {
    expect(fn({ value: "x" })).toBe("x");
  });
});

describe("builtins · date helpers", () => {
  it("make_date 补零", () => {
    const fn = getBuiltinFunction("make_date")!;
    expect(fn({ year: 1973, month: 4, day: 5 })).toBe("1973-04-05");
    expect(fn({ year: 2025 })).toBe("2025-01-01");
  });

  it("date_diff_months 自然月差", () => {
    const fn = getBuiltinFunction("date_diff_months")!;
    expect(fn({ from: "2025-12-31", to: "2026-03-01" })).toBe(3);
    expect(fn({ from: "2025-01-01", to: "2025-01-01" })).toBe(0);
  });

  it("date_add_years_months 处理月溢出", () => {
    const fn = getBuiltinFunction("date_add_years_months")!;
    expect(fn({ date: "2025-11-15", years: 0, months: 3 })).toBe("2026-02-15");
    expect(fn({ date: "2025-03-10", years: 1, months: 0 })).toBe("2026-03-10");
  });

  it("date_add_years_months 月末日期钳制（不产生 2-31 / 非闰年 2-29）", () => {
    const fn = getBuiltinFunction("date_add_years_months")!;
    // 1-31 + 1 月 → 2 月没有 31 号；2000 是闰年，钳到 29
    expect(fn({ date: "2000-01-31", years: 0, months: 1 })).toBe("2000-02-29");
    // 闰年 2-29 + 63 年 → 2023 非闰年，钳到 28
    expect(fn({ date: "1960-02-29", years: 63, months: 0 })).toBe("2023-02-28");
    // 1-31 + 1 月（落到非闰年 2 月）→ 2-28
    expect(fn({ date: "2001-01-31", years: 0, months: 1 })).toBe("2001-02-28");
    // 正常日期不受影响
    expect(fn({ date: "2026-03-15", years: 0, months: 0 })).toBe("2026-03-15");
  });
});

describe("builtins · compute_delayed_retire_age (2025 渐进式延迟退休)", () => {
  const fn = getBuiltinFunction("compute_delayed_retire_age")!;

  it("1975 年女工人（worker50）起点 50 岁，开始延迟", () => {
    const r = fn({
      gender: "female",
      female_retire_type: "worker50",
      birth_year: 1975,
      birth_month: 1,
    }) as Record<string, number>;
    expect(r.original_retire_age_years).toBe(50);
    expect(r.legal_retire_age_years).toBeGreaterThanOrEqual(50);
  });

  it("早于政策起点的出生年份不延迟", () => {
    const r = fn({
      gender: "female",
      female_retire_type: "worker50",
      birth_year: 1970,
      birth_month: 1,
    }) as Record<string, number>;
    expect(r.legal_retire_age_years).toBe(50);
    expect(r.legal_retire_age_months).toBe(0);
  });

  it("男性起点 60 岁，封顶 63 岁", () => {
    const r = fn({
      gender: "male",
      birth_year: 1990,
      birth_month: 1,
    }) as Record<string, number>;
    expect(r.original_retire_age_years).toBe(60);
    expect(r.legal_retire_age_years).toBeLessThanOrEqual(63);
  });

  it("缺性别/出生年返回 null", () => {
    expect(fn({ gender: "", birth_year: 0 })).toBeNull();
  });
});

describe("builtins · registry", () => {
  it("已注册函数可被查到，未注册返回 null", () => {
    expect(getBuiltinFunction("parse_birth_year")).toBeTypeOf("function");
    expect(getBuiltinFunction("does_not_exist")).toBeNull();
  });

  it("listBuiltinFunctions 含核心函数", () => {
    const names = listBuiltinFunctions();
    expect(names).toContain("compute_delayed_retire_age");
    expect(names).toContain("parse_birth_year");
  });
});
