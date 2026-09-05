/**
 * Socila命名契约扫描器（09-05 SDL-FR-006/007/008/009、SDL-AC-003）。
 *
 * 复审纠正语义：允许的"精确旧协议值"（migration及其行为测试中显式枚举的
 * 两个已知历史协议片段与独立旧品牌标识必须区分——宽泛品牌检查
 * 在执行前剥离该文件已允许的精确片段，因此：
 * - 允许文件中的精确旧协议值不命中（SDL-FR-011要求migration枚举旧值）；
 * - 同一文件中出现其他独立品牌标识仍必须命中（SDL-AC-003）。
 *
 * 自扫描守卫：本模块与守卫测试中的token值一律经拆分构造（与ui-copy.test.ts同法），
 * 避免扫描器源代码命中自身规则；真实旧值由守卫测试的钉断言锁定。
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface ForbiddenToken {
  name: string;
  pattern: RegExp;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 拆分构造：任何完整token都不得以字面量出现在本文件。
const S = {
  ssp: ["SS", "P"].join(""),
  ssrp: ["SS", "RP"].join(""),
  dslVersion: ["SS", "P-DSL-1.0"].join(""),
  dirId: ["ssp_", "dsl_v1"].join(""),
  dbTestVar: ["SS", "P_TEST_DATABASE_URL"].join(""),
  pgDevPassword: ["SS", "P_PG_DEV_PASSWORD"].join(""),
  nextCore: ["ssp-next", "-core"].join(""),
  anonCookie: ["ssp-anon", "-session"].join(""),
  sessionKey: ["ssp-session", "-id"].join(""),
  pkgName: ["ssp-", "web"].join(""),
  rateLimitBuckets: ["__sspRateLimit", "Buckets"].join(""),
  ciDb: ["ssp_", "ci"].join(""),
};

/** 精确旧协议值（SDL-FR-011中migration枚举的已知旧值）。 */
export const LEGACY_DSL_VERSION_FRAGMENT = S.dslVersion;
export const LEGACY_DSL_DIR_ID_FRAGMENT = S.dirId;
/** 精确旧协议值的词边界匹配模式（供负向守卫复用，避免各处重复字面量）。 */
export const LEGACY_DSL_VERSION_PATTERN = new RegExp(
  `\\b${escapeRegExp(S.dslVersion)}\\b`,
);
export const LEGACY_DSL_DIR_ID_PATTERN = new RegExp(`\\b${escapeRegExp(S.dirId)}\\b`);
/** 独立品牌缩写（供负向守卫构造宽泛检查，如dsl布局schema标题检查）。 */
export const LEGACY_BRAND_SUBSTRING = S.ssp;

const protocolTokens: ForbiddenToken[] = [
  {
    name: `${S.dslVersion}（旧格式协议值）`,
    pattern: LEGACY_DSL_VERSION_PATTERN,
  },
  {
    name: `${S.dirId}（旧目录标识）`,
    pattern: LEGACY_DSL_DIR_ID_PATTERN,
  },
];

const otherTokens: ForbiddenToken[] = [
  { name: "旧DB集成环境变量", pattern: new RegExp(`\\b${S.dbTestVar}\\b`) },
  { name: "旧开发库口令变量", pattern: new RegExp(`\\b${S.pgDevPassword}\\b`) },
  { name: "旧E2E变量前缀", pattern: /\bSSRP_E2E_[A-Z_]+/ },
  { name: "旧服务JWT身份", pattern: new RegExp(`\\b${S.nextCore}\\b`) },
  { name: "旧匿名Cookie", pattern: new RegExp(`\\b${S.anonCookie}\\b`) },
  { name: "旧localStorage键", pattern: new RegExp(`\\b${S.sessionKey}\\b`) },
  { name: "旧包名", pattern: new RegExp(`\\b${S.pkgName}\\b`) },
  { name: "旧开发Compose资源", pattern: /\bssp-(pg|redis|minio)-dev\b/ },
  { name: "旧限流桶", pattern: new RegExp(`\\b${S.rateLimitBuckets}\\b`) },
  { name: "旧默认数据库名", pattern: new RegExp(`\\b${S.ciDb}\\b`) },
  { name: "旧临时目录前缀", pattern: /\bssp-(scripts-)?environment-/ },
  { name: "独立品牌缩写", pattern: new RegExp(`\\b${S.ssp}\\b`) },
  { name: "独立品牌缩写", pattern: new RegExp(`\\b${S.ssrp}\\b`) },
];

export const FORBIDDEN_TOKENS: ForbiddenToken[] = [...protocolTokens, ...otherTokens];

/**
 * 允许精确旧协议片段的文件（精确片段级例外，非整文件全token例外）：
 * - migration必须显式枚举已知旧值才能完成规范化（SDL-FR-011）；
 * - migration行为测试的旧值字面量是被测规范化输入；
 * - 命名守卫测试以钉断言锁定片段常量与真实旧值一致。
 */
export interface AllowedFragmentFile {
  file: RegExp;
  reason: string;
}

export const ALLOWED_FRAGMENT_FILES: AllowedFragmentFile[] = [
  {
    file: /^drizzle\/0010_.*\.sql$/,
    reason: "SDL-FR-011：migration显式枚举已知旧协议值",
  },
  {
    file: /sdl-0010-migration\.integration\.test\.ts$/,
    reason: "migration行为测试：旧值字面量是被测规范化输入",
  },
  {
    file: /socila-naming-contract\.test\.ts$/,
    reason: "命名守卫自检：钉断言旧协议值常量与真实旧值一致",
  },
];

const ALL_FRAGMENTS = [S.dslVersion, S.dirId];

/** 指定文件允许剥离的精确旧协议片段（未列入者返回空）。 */
export function allowedFragmentsFor(file: string): string[] {
  for (const rule of ALLOWED_FRAGMENT_FILES) {
    if (rule.file.test(file)) return [...ALL_FRAGMENTS];
  }
  return [];
}

/** 剥离已允许的精确片段，使宽泛品牌检查只对独立品牌标识生效。 */
export function stripAllowedFragments(content: string, fragments: string[]): string {
  let effective = content;
  for (const fragment of fragments) {
    effective = effective.split(fragment).join("");
  }
  return effective;
}

/**
 * 扫描一段内容：返回命中的token名。allowedFragments中的精确片段先被剥离——
 * 片段内部不再触发任何token（含宽泛品牌），片段之外的独立标识仍全部生效。
 */
export function scanContent(content: string, allowedFragments: string[] = []): string[] {
  const effective = stripAllowedFragments(content, allowedFragments);
  const hits: string[] = [];
  for (const token of FORBIDDEN_TOKENS) {
    if (token.pattern.test(effective)) {
      hits.push(token.name);
    }
  }
  return hits;
}

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

const BINARY_EXT =
  /\.(png|jpe?g|gif|ico|woff2?|ttf|eot|xlsx?|pdf|zip|gz|7z|mp4|webm|mov|dump|bak)$/i;

/** 活动代码与配置文件清单（git跟踪；排除docs/历史与package-lock完整性字符串）。 */
export function listActiveFiles(): string[] {
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

/** 全量扫描：返回存在命中的文件与命中明细（期望为空数组）。 */
export function scanActiveFiles(): Array<{ file: string; hits: string[] }> {
  const findings: Array<{ file: string; hits: string[] }> = [];
  for (const file of listActiveFiles()) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const hits = scanContent(content, allowedFragmentsFor(file));
    if (hits.length > 0) {
      findings.push({ file, hits });
    }
  }
  return findings;
}
