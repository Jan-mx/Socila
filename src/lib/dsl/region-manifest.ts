/**
 * 地区DSL Manifest类型、校验与发现（09-05 SDL-FR-002/003/004）。
 *
 * 通用协议位于 `dsl/protocol/socila_dsl_v1`（Schema与发布工作流，地区无关）；
 * 地区资产位于 `dsl/regions/<slug>_dsl_v1` 并由 `rules_manifest.json` 声明
 * 行政区划代码、资产版本与相对路径。发现器先校验Manifest（规范格式值、路径
 * 不越出地区目录、引用文件存在、规则清单与目录双向一致），再把
 * jurisdiction_code与资产路径交给Seed装载——装载代码不硬编码任何地区目录或
 * 行政区划（SDL-AC-002：新增地区无需修改本模块或上海常量）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** 规则格式的唯一规范值（SDL-FR-001），与 socila_rule_dsl.schema.json 的 const 同源。 */
export const CANONICAL_DSL_VERSION = "SOCILA-DSL-1.0";

/** 规范格式值字面量类型：dsl_version只表示JSON格式，不编码地区或政策内容版本。 */
export type CanonicalDslVersion = typeof CANONICAL_DSL_VERSION;

export interface RegionRuleEntry {
  rule_id: string;
  file: string;
}

export interface RegionDslManifest {
  dsl_version: CanonicalDslVersion;
  region_slug: string;
  jurisdiction_code: string;
  bundle_version: number;
  params_file: string;
  rule_set_file: string;
  tests_file: string;
  rules: RegionRuleEntry[];
}

export interface DiscoveredRegion {
  manifest: RegionDslManifest;
  /** 地区资产目录（绝对路径）。 */
  regionDir: string;
  /** 规则文件清单（绝对路径 + 目录内文件名），与manifest.rules顺序一致。 */
  ruleFiles: Array<{ ruleId: string; fileName: string; absolutePath: string }>;
  paramsPath: string;
  ruleSetPath: string;
  testsPath: string;
}

export interface RegionDslRoots {
  /** 通用协议目录（默认 `dsl/protocol/socila_dsl_v1`）。 */
  protocolRoot?: string;
  /** 地区资产根目录（默认 `dsl/regions`）。 */
  regionsRoot?: string;
}

const REGION_DIR_SUFFIX = "_dsl_v1";
const MANIFEST_FILE = "rules_manifest.json";

function defaultRoots(): Required<RegionDslRoots> {
  return {
    protocolRoot: path.join(process.cwd(), "dsl/protocol/socila_dsl_v1"),
    regionsRoot: path.join(process.cwd(), "dsl/regions"),
  };
}

function assertPlainRelativePath(regionDir: string, relative: string, field: string): string {
  if (typeof relative !== "string" || relative.length === 0) {
    throw new Error(`${field}: must be a non-empty relative path`);
  }
  const resolved = path.resolve(regionDir, relative);
  const normalizedDir = path.resolve(regionDir);
  if (!resolved.startsWith(normalizedDir + path.sep)) {
    throw new Error(
      `${field}: 引用越出地区目录（${relative}）——地区资产必须位于地区目录内`,
    );
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error(`${field}: 引用文件不存在（${relative}）`);
  }
  return resolved;
}

function parseManifest(regionDir: string): RegionDslManifest {
  const manifestPath = path.join(regionDir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    throw new Error(`地区目录缺少 ${MANIFEST_FILE}: ${regionDir}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    throw new Error(`${MANIFEST_FILE} 不是合法JSON: ${(err as Error).message}`);
  }
  const m = raw as Partial<RegionDslManifest> & Record<string, unknown>;
  if (m.dsl_version !== CANONICAL_DSL_VERSION) {
    throw new Error(
      `${MANIFEST_FILE}: dsl_version 必须为规范值 ${CANONICAL_DSL_VERSION}（实际: ${String(m.dsl_version)}）`,
    );
  }
  if (typeof m.region_slug !== "string" || m.region_slug.length === 0) {
    throw new Error(`${MANIFEST_FILE}: region_slug 必须为非空字符串`);
  }
  if (typeof m.jurisdiction_code !== "string" || !/^\d{1,20}$/.test(m.jurisdiction_code)) {
    throw new Error(`${MANIFEST_FILE}: jurisdiction_code 必须为行政区划代码字符串`);
  }
  if (typeof m.bundle_version !== "number" || !Number.isInteger(m.bundle_version) || m.bundle_version < 1) {
    throw new Error(`${MANIFEST_FILE}: bundle_version 必须为正整数`);
  }
  if (!Array.isArray(m.rules) || m.rules.length === 0) {
    throw new Error(`${MANIFEST_FILE}: rules 必须为非空数组`);
  }
  for (const entry of m.rules as RegionRuleEntry[]) {
    if (typeof entry?.rule_id !== "string" || typeof entry?.file !== "string") {
      throw new Error(`${MANIFEST_FILE}: rules条目必须包含 rule_id 与 file`);
    }
  }
  return m as RegionDslManifest;
}

/**
 * 发现并校验全部地区。任一Manifest与实际文件集合不一致即抛错（SDL失败模式：
 * Manifest与文件集合不一致 → Seed失败，不写数据库）。
 */
export function discoverRegionDsl(roots?: RegionDslRoots): DiscoveredRegion[] {
  const { protocolRoot, regionsRoot } = { ...defaultRoots(), ...roots };
  if (!existsSync(protocolRoot)) {
    throw new Error(`通用协议目录不存在: ${protocolRoot}`);
  }
  if (!existsSync(regionsRoot)) {
    throw new Error(`地区资产根目录不存在: ${regionsRoot}`);
  }

  const regionDirs = readdirSync(regionsRoot)
    .filter((d) => d.endsWith(REGION_DIR_SUFFIX))
    .sort();

  const discovered: DiscoveredRegion[] = [];
  for (const dirName of regionDirs) {
    const regionDir = path.join(regionsRoot, dirName);
    if (!statSync(regionDir).isDirectory()) continue;

    const manifest = parseManifest(regionDir);
    const expectedSlug = dirName.slice(0, -REGION_DIR_SUFFIX.length);
    if (manifest.region_slug !== expectedSlug) {
      throw new Error(
        `${MANIFEST_FILE}: region_slug（${manifest.region_slug}）与目录名（${dirName}）不一致`,
      );
    }

    // 规则清单与目录文件集合双向一致（SDL §7不变量）。
    const diskFiles = readdirSync(path.join(regionDir, "rules"))
      .filter((f) => f.endsWith(".json"))
      .sort();
    const declaredIds = manifest.rules.map((r) => r.rule_id);
    const declaredFiles = manifest.rules.map((r) => r.file).sort();
    if (
      declaredIds.length !== new Set(declaredIds).size ||
      new Set(declaredFiles).size !== declaredFiles.length
    ) {
      throw new Error(`${MANIFEST_FILE}: rules清单存在重复条目`);
    }
    for (const missing of declaredFiles.filter((f) => !diskFiles.includes(f))) {
      throw new Error(
        `${MANIFEST_FILE}: 规则清单声明了磁盘缺失的文件（${missing}）——Manifest与文件集合不一致`,
      );
    }
    for (const undeclared of diskFiles.filter((f) => !declaredFiles.includes(f))) {
      throw new Error(
        `${MANIFEST_FILE}: rules目录存在未声明的文件（${undeclared}）——Manifest与文件集合不一致`,
      );
    }

    const ruleFiles = manifest.rules.map((entry) => {
      // 规则文件路径同样不得越出地区目录。
      const resolved = assertPlainRelativePath(
        regionDir,
        path.join("rules", entry.file),
        "rules",
      );
      const parsed = JSON.parse(readFileSync(resolved, "utf8")) as {
        rule_id?: string;
        dsl_version?: string;
      };
      if (parsed.rule_id !== entry.rule_id) {
        throw new Error(
          `规则文件 ${entry.file} 的 rule_id（${parsed.rule_id}）与Manifest（${entry.rule_id}）不一致`,
        );
      }
      if (parsed.dsl_version !== CANONICAL_DSL_VERSION) {
        throw new Error(
          `规则文件 ${entry.file} 的 dsl_version（${parsed.dsl_version}）不是规范值 ${CANONICAL_DSL_VERSION}`,
        );
      }
      return {
        ruleId: entry.rule_id,
        fileName: entry.file,
        absolutePath: resolved,
      };
    });

    const paramsPath = assertPlainRelativePath(
      regionDir,
      manifest.params_file,
      "params_file",
    );
    const ruleSetPath = assertPlainRelativePath(
      regionDir,
      manifest.rule_set_file,
      "rule_set_file",
    );
    const testsPath = assertPlainRelativePath(
      regionDir,
      manifest.tests_file,
      "tests_file",
    );

    discovered.push({
      manifest,
      regionDir,
      ruleFiles,
      paramsPath,
      ruleSetPath,
      testsPath,
    });
  }

  if (discovered.length === 0) {
    throw new Error(`地区资产根目录没有任何 *_dsl_v1 地区: ${regionsRoot}`);
  }
  return discovered;
}

/** 发布工作流的协议级位置（地区无关，SDL-FR-002）。 */
export function protocolWorkflowPath(): string {
  return path.join(
    process.cwd(),
    "dsl/protocol/socila_dsl_v1/workflows/publish_workflow_default.json",
  );
}
