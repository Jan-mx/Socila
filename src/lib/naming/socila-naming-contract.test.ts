/**
 * Socila命名契约扫描（09-05 SDL-FR-006/007/008/009、SDL-AC-003）。
 *
 * 活动代码与配置中禁止出现历史SSP/SSRP运行标识：本Feature执行一次性硬切换，
 * 不提供旧环境变量、Cookie、localStorage、服务JWT身份或开发Compose资源名的兼容别名
 * （SDL-NFR-004 Fail-fast；SDL-FR-014：历史报告与归档保留原始标识，不在扫描范围）。
 *
 * 扫描范围是Git跟踪的活动代码与配置文件；排除docs/（历史证据与PRD叙述）、
 * package-lock.json（依赖完整性字符串）。唯一允许的例外是dsl_version规范化
 * migration中的已知旧值字面量（SDL-FR-011要求migration显式枚举旧值）。
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** 禁止token：token名 → 内容匹配正则。 */
const FORBIDDEN_TOKENS: Array<{ name: string; pattern: RegExp }> = [
  { name: "SSP-DSL-1.0（旧格式标识）", pattern: /\bSSP-DSL-1\.0\b/ },
  { name: "ssp_dsl_v1（旧目录/格式标识）", pattern: /\bssp_dsl_v1\b/ },
  { name: "SSP_TEST_DATABASE_URL（旧DB集成变量）", pattern: /\bSSP_TEST_DATABASE_URL\b/ },
  { name: "SSP_PG_DEV_PASSWORD（旧开发库口令变量）", pattern: /\bSSP_PG_DEV_PASSWORD\b/ },
  { name: "SSRP_E2E_*（旧E2E变量前缀）", pattern: /\bSSRP_E2E_[A-Z_]+/ },
  { name: "ssp-next-core（旧服务JWT身份）", pattern: /\bssp-next-core\b/ },
  { name: "ssp-anon-session（旧匿名Cookie）", pattern: /\bssp-anon-session\b/ },
  { name: "ssp-session-id（旧localStorage键）", pattern: /\bssp-session-id\b/ },
  { name: "ssp-web（旧包名）", pattern: /\bssp-web\b/ },
  { name: "ssp-pg-dev（旧开发Compose资源）", pattern: /\bssp-pg-dev\b/ },
  { name: "ssp-redis-dev（旧开发Compose资源）", pattern: /\bssp-redis-dev\b/ },
  { name: "ssp-minio-dev（旧开发Compose资源）", pattern: /\bssp-minio-dev\b/ },
  { name: "__sspRateLimitBuckets（旧限流桶）", pattern: /\b__sspRateLimitBuckets\b/ },
  { name: "ssp_ci（旧默认数据库名）", pattern: /\bssp_ci\b/ },
  { name: "ssp-environment-（旧临时目录前缀）", pattern: /\bssp-environment-/ },
  { name: "ssp-scripts-environment-（旧临时目录前缀）", pattern: /\bssp-scripts-environment-/ },
  { name: "SSP品牌缩写（活动代码）", pattern: /\bSSP\b/ },
  { name: "SSRP品牌缩写（活动代码）", pattern: /\bSSRP\b/ },
];

/** 允许的例外：文件（相对路径正则）→ 允许出现的token名集合。 */
const ALLOWED_EXCEPTIONS: Array<{ file: RegExp; tokens: string[] }> = [
  {
    // SDL-FR-011：migration必须显式枚举已知旧值才能完成规范化。
    file: /^drizzle\/0010_.*\.sql$/,
    tokens: ["SSP-DSL-1.0（旧格式标识）", "ssp_dsl_v1（旧目录/格式标识）"],
  },
  {
    // migration行为测试：旧值字面量是被测规范化输入（等价于migration SQL本身）。
    file: /sdl-0010-migration\.integration\.test\.ts$/,
    tokens: ["SSP-DSL-1.0（旧格式标识）", "ssp_dsl_v1（旧目录/格式标识）"],
  },
  {
    // 负向守卫与自扫描：token表与"不得出现"断言必须能写出被禁token本身。
    // 这些文件不构成任何运行时标识或配置读取。
    file: /socila-naming-contract\.test\.ts$/,
    tokens: FORBIDDEN_TOKENS.map((t) => t.name),
  },
  {
    file: /dsl-layout\.test\.ts$/,
    tokens: ["SSP-DSL-1.0（旧格式标识）", "ssp_dsl_v1（旧目录/格式标识）"],
  },
  {
    file: /region-manifest\.test\.ts$/,
    tokens: ["SSP-DSL-1.0（旧格式标识）"],
  },
  {
    file: /db\/seed\/index\.test\.ts$/,
    tokens: ["ssp_dsl_v1（旧目录/格式标识）"],
  },
];

const ACTIVE_ROOT_PREFIXES = [
  "src/",
  "scripts/",
  "services/",
  "e2e/",
  "dsl/",
  "drizzle/",
  "infra/",
  "testdata/",
  ".github/",
];

const ACTIVE_ROOT_FILES = new Set([
  "package.json",
  "playwright.config.ts",
  "vitest.config.ts",
  "vitest.integration.config.ts",
  "drizzle.config.ts",
  "eslint.config.mjs",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "Dockerfile",
  ".env.example",
]);

const BINARY_EXT = /\.(png|jpe?g|gif|ico|woff2?|ttf|eot|xlsx?|pdf|zip|gz|7z|mp4|webm|mov|dump|bak)$/i;

function listActiveFiles(): string[] {
  const tracked = execSync("git ls-files", {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return tracked.filter((f) => {
    if (f.startsWith("docs/") || f === "package-lock.json") return false;
    if (BINARY_EXT.test(f)) return false;
    if (ACTIVE_ROOT_FILES.has(f)) return true;
    return ACTIVE_ROOT_PREFIXES.some((p) => f.startsWith(p));
  });
}

function allowedTokensFor(file: string): Set<string> {
  const allowed = new Set<string>();
  for (const rule of ALLOWED_EXCEPTIONS) {
    if (rule.file.test(file)) {
      for (const t of rule.tokens) allowed.add(t);
    }
  }
  return allowed;
}

describe("Socila命名契约（SDL-AC-003：活动路径无遗留SSP/SSRP运行标识）", () => {
  it("活动代码与配置零遗留标识命中", () => {
    const files = listActiveFiles();
    expect(files.length).toBeGreaterThan(50);

    const hits: string[] = [];
    for (const file of files) {
      let content: string;
      try {
        content = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const allowed = allowedTokensFor(file);
      for (const token of FORBIDDEN_TOKENS) {
        if (allowed.has(token.name)) continue;
        if (token.pattern.test(content)) {
          const lines = content
            .split("\n")
            .map((l, i) => (token.pattern.test(l) ? i + 1 : 0))
            .filter(Boolean)
            .slice(0, 5);
          hits.push(`${file} [${token.name}] 行: ${lines.join(",")}`);
        }
      }
    }

    expect(hits).toEqual([]);
  });
});
