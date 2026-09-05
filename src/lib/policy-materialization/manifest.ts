/**
 * NRP-FR-017/FR-019 确定性物化manifest：
 * 只从Git已提交内容（git show HEAD:path）构建，覆盖规则/参数/规则集/政策包版本，
 * 不包含tests/cases/showcase_cases/快照或发布事件（PRD §6.3）。
 * manifestHash = 规范化JSON的SHA-256（不含hash字段自身），同一提交内容恒定。
 */
import { sha256, canonicalJson } from "./target";

export type RegionJurisdiction = "CN" | "310000" | "440000" | "510000";
export type Readiness = "awaiting_approval" | "blocked";

export interface ManifestRule {
  businessKey: string;
  file: string;
  contentHash: string;
  payload: Record<string, unknown>;
}

export interface ManifestParam {
  businessKey: string;
  kind: "scalar" | "table";
  contentHash: string;
  payload: Record<string, unknown>;
}

export interface ManifestRegion {
  jurisdictionCode: RegionJurisdiction;
  regionSlug: string;
  packId: string;
  packFile: string;
  packAsOf: string;
  ruleSetFile: string;
  ruleSetPayload: Record<string, unknown> | null;
  testsFile: string;
  rules: ManifestRule[];
  params: ManifestParam[];
  readiness: Readiness;
  blockingReasons: string[];
}

export interface PolicyMaterializationManifest {
  manifestVersion: 1;
  sourceCommit: string;
  builtFrom: "committed-dsl";
  regions: ManifestRegion[];
  counts: { rules: number; params: number; ruleSets: number; packs: number };
}

export interface GitReader {
  /** git show HEAD:path → 文件内容（不存在时抛错）。 */
  showHead(path: string): string;
  /** git ls-tree 已提交文件清单。 */
  listCommittedFiles(dir: string): string[];
  /** 工作树对指定路径是否有未提交改动。 */
  isWorktreeDirty(dir: string): boolean;
}

/** 地区覆盖状态与阻断原因（NRP-FR-022，PRD §1.1核对表）。 */
export function regionReadiness(jurisdictionCode: string): {
  readiness: Readiness;
  blockingReasons: string[];
} {
  switch (jurisdictionCode) {
    case "440000":
      return {
        readiness: "blocked",
        blockingReasons: [
          "2025-07后缴费基数上下限未取得权威原文（粤人社发〔2025〕32号未见于省厅官网）",
          "《广东省失业保险条例》原文未在白名单域名获取，失业待遇缺口",
          "2030年前市级医保退休口径缺失（省级统一自2030-01-01起生效）",
        ],
      };
    case "510000":
      return {
        readiness: "blocked",
        blockingReasons: [
          "医保退休年限省级统一文件未正式印发（仅2025-03征求意见稿，不作为事实源）",
          "失业保险金标准原文（川人社办发〔2023〕18号）未在白名单域名获取",
          "2026年度缴费基数未公布，2025年度参数窗口已失效",
        ],
      };
    default:
      return { readiness: "awaiting_approval", blockingReasons: [] };
  }
}

interface RuleManifestJson {
  rules: Array<{ rule_id: string; file: string }>;
  params_file: string;
  rule_set_file: string;
  tests_file: string;
  jurisdiction_code: string;
  region_slug: string;
}

interface RuleFileJson {
  rule_id: string;
  decision_table: unknown;
  [key: string]: unknown;
}

interface PackFileJson {
  policy_pack_id: string;
  params: Array<Record<string, unknown>>;
  tables: Array<Record<string, unknown>>;
}

const REGION_DIRS: Array<{ dir: string; jurisdiction: RegionJurisdiction }> = [
  { dir: "dsl/regions/cn_dsl_v1", jurisdiction: "CN" },
  { dir: "dsl/regions/guangdong_dsl_v1", jurisdiction: "440000" },
  { dir: "dsl/regions/sichuan_dsl_v1", jurisdiction: "510000" },
  { dir: "dsl/regions/shanghai_dsl_v1", jurisdiction: "310000" },
];

/**
 * 从已提交内容构建manifest。gitReader由调用方注入（生产用child_process执行git，
 * 测试注入假实现）。
 */
export function buildManifest(git: GitReader): PolicyMaterializationManifest {
  const sourceCommit = git.showHead("COMMIT").trim();
  const regions: ManifestRegion[] = [];

  for (const { dir, jurisdiction } of REGION_DIRS) {
    const manifestPath = `${dir}/rules_manifest.json`;
    const manifest = JSON.parse(git.showHead(manifestPath)) as RuleManifestJson;
    if (manifest.jurisdiction_code !== jurisdiction) {
      throw new Error(
        `[manifest] ${manifestPath} 的 jurisdiction_code 与预期不一致`,
      );
    }

    const rules: ManifestRule[] = manifest.rules.map((entry) => {
      const filePath = `${dir}/rules/${entry.file}`;
      const raw = git.showHead(filePath);
      const payload = JSON.parse(raw) as RuleFileJson;
      if (payload.rule_id !== entry.rule_id) {
        throw new Error(`[manifest] ${filePath} 的 rule_id 与清单不一致`);
      }
      return {
        businessKey: entry.rule_id,
        file: entry.file,
        contentHash: sha256(canonicalJson(payload)),
        payload: payload as Record<string, unknown>,
      };
    });

    const packRaw = git.showHead(`${dir}/${manifest.params_file}`);
    const pack = JSON.parse(packRaw) as PackFileJson;
    const params: ManifestParam[] = [
      ...pack.params.map((p) => ({
        businessKey: p.param_id as string,
        kind: "scalar" as const,
        contentHash: sha256(canonicalJson(p)),
        payload: p,
      })),
      ...pack.tables.map((t) => ({
        businessKey: t.param_id as string,
        kind: "table" as const,
        contentHash: sha256(canonicalJson(t)),
        payload: t,
      })),
    ];

    const { readiness, blockingReasons } = regionReadiness(jurisdiction);
    const ruleSetPayload = JSON.parse(
      git.showHead(`${dir}/${manifest.rule_set_file}`),
    ) as Record<string, unknown>;
    regions.push({
      jurisdictionCode: jurisdiction,
      regionSlug: manifest.region_slug,
      packId: pack.policy_pack_id,
      packAsOf:
        typeof (pack as unknown as { as_of?: unknown }).as_of === "string"
          ? (pack as unknown as { as_of: string }).as_of
          : sourceCommit.slice(0, 10),
      packFile: manifest.params_file,
      ruleSetFile: manifest.rule_set_file,
      ruleSetPayload,
      testsFile: manifest.tests_file,
      rules,
      params,
      readiness,
      blockingReasons,
    });
  }

  const manifest: PolicyMaterializationManifest = {
    manifestVersion: 1,
    sourceCommit,
    builtFrom: "committed-dsl",
    regions,
    counts: {
      rules: regions.reduce((n, r) => n + r.rules.length, 0),
      params: regions.reduce((n, r) => n + r.params.length, 0),
      ruleSets: regions.filter((r) => r.ruleSetFile !== null).length,
      packs: regions.length,
    },
  };
  return manifest;
}

/** manifestHash：剔除hash字段后的规范化JSON哈希。 */
export function manifestHash(manifest: PolicyMaterializationManifest): string {
  const { ...rest } = manifest as PolicyMaterializationManifest & {
    manifestHash?: string;
  };
  return sha256(canonicalJson(rest));
}

/** 规则/参数实体的内容哈希（批次成员审计用）。 */
export function entityContentHash(
  entityType: "rule" | "param" | "rule_set" | "policy_pack_version",
  jurisdictionCode: string,
  businessKey: string,
  version: number,
  payload: unknown,
): string {
  return sha256(
    canonicalJson({ entityType, jurisdictionCode, businessKey, version, payload }),
  );
}
