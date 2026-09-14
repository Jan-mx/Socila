/**
 * 政策基线夹具（WI-20260914-01 CIG-FR-003/004）。
 *
 * `shv2-shanghai-delta.integration.test.ts`需要"SHV2之前的持久库"基线——即历史提交
 * `d7fd63a`四地区DSL物化结果。squash后的`main`不可达该Git对象，CI干净checkout
 * 无法`git show`。本模块把基线DSL文件固化为版本化JSON夹具，并在加载时失败关闭校验：
 * schema、fixtureVersion、40位sourceCommit、files映射规范化JSON的SHA-256，以及
 * （由调用方显式执行）用当前`buildManifest`重建后的四类计数。
 *
 * 夹具由`scripts/build-policy-baseline-fixture.ts`从本地Git对象只读提取一次；
 * 运行时测试不再依赖任何Git历史。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildManifest, type GitReader } from "./manifest";
import { canonicalJson, sha256 } from "./target";

export const POLICY_BASELINE_FIXTURE_SCHEMA = "socila.policy-baseline-fixture";
export const POLICY_BASELINE_FIXTURE_VERSION = 1;

export const DEFAULT_POLICY_BASELINE_FIXTURE_PATH = fileURLToPath(
  new URL("./__fixtures__/policy-baseline-d7fd63a.json", import.meta.url),
);

export interface PolicyBaselineCounts {
  rules: number;
  params: number;
  ruleSets: number;
  packs: number;
}

export interface PolicyBaselineFixture {
  schema: typeof POLICY_BASELINE_FIXTURE_SCHEMA;
  fixtureVersion: typeof POLICY_BASELINE_FIXTURE_VERSION;
  /** 基线来源提交（完整40位SHA）。 */
  sourceCommit: string;
  /** 提取方式说明（只读`git show <commit>:<path>`）。 */
  extractedFrom: "git-object";
  /** 用当前buildManifest重建基线manifest时必须得到的四类计数。 */
  expectedCounts: PolicyBaselineCounts;
  /** sha256(canonicalJson(files))。 */
  contentSha256: string;
  /** 仓库相对路径 → 文件UTF-8原文（仅manifest/rules/params/rule_set，不含tests）。 */
  files: Record<string, string>;
}

export class PolicyBaselineFixtureError extends Error {
  constructor(
    public readonly code:
      | "FIXTURE_INVALID"
      | "FIXTURE_CONTENT_SHA_MISMATCH"
      | "FIXTURE_COUNTS_MISMATCH"
      | "FIXTURE_PATH_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "PolicyBaselineFixtureError";
  }
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

export function fixtureContentSha256(files: Record<string, string>): string {
  return sha256(canonicalJson(files));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(field: string, detail: string): never {
  throw new PolicyBaselineFixtureError("FIXTURE_INVALID", `政策基线夹具字段 ${field} 非法：${detail}`);
}

/** 解析并校验夹具结构与内容哈希（不核对计数——计数由assertFixtureBaselineCounts核对）。 */
export function parsePolicyBaselineFixture(raw: unknown): PolicyBaselineFixture {
  if (!isRecord(raw)) {
    throw new PolicyBaselineFixtureError("FIXTURE_INVALID", "政策基线夹具必须是JSON对象");
  }
  if (raw.schema !== POLICY_BASELINE_FIXTURE_SCHEMA) {
    invalid("schema", `期望 ${POLICY_BASELINE_FIXTURE_SCHEMA}，实际 ${String(raw.schema)}`);
  }
  if (raw.fixtureVersion !== POLICY_BASELINE_FIXTURE_VERSION) {
    invalid("fixtureVersion", `期望 ${POLICY_BASELINE_FIXTURE_VERSION}，实际 ${String(raw.fixtureVersion)}`);
  }
  if (typeof raw.sourceCommit !== "string" || !COMMIT_SHA.test(raw.sourceCommit)) {
    invalid("sourceCommit", "必须是完整40位小写十六进制提交SHA");
  }
  if (raw.extractedFrom !== "git-object") {
    invalid("extractedFrom", "必须为 git-object");
  }
  if (!isRecord(raw.expectedCounts)) {
    invalid("expectedCounts", "必须是对象");
  }
  const counts = raw.expectedCounts as Record<string, unknown>;
  for (const key of ["rules", "params", "ruleSets", "packs"] as const) {
    if (typeof counts[key] !== "number" || !Number.isInteger(counts[key]) || (counts[key] as number) < 0) {
      invalid(`expectedCounts.${key}`, "必须是非负整数");
    }
  }
  if (typeof raw.contentSha256 !== "string" || !SHA256_HEX.test(raw.contentSha256)) {
    invalid("contentSha256", "必须是64位小写十六进制");
  }
  if (!isRecord(raw.files) || Object.keys(raw.files).length === 0) {
    invalid("files", "必须是非空的 路径→内容 映射");
  }
  const files: Record<string, string> = {};
  for (const [p, content] of Object.entries(raw.files)) {
    if (typeof content !== "string") invalid(`files[${p}]`, "内容必须是字符串");
    if (p.startsWith("/") || p.includes("..")) invalid(`files[${p}]`, "路径必须是仓库相对路径");
    files[p] = content as string;
  }
  const actualSha = fixtureContentSha256(files);
  if (actualSha !== raw.contentSha256) {
    throw new PolicyBaselineFixtureError(
      "FIXTURE_CONTENT_SHA_MISMATCH",
      `政策基线夹具 contentSha256 不符：声明 ${raw.contentSha256} 重算 ${actualSha}`,
    );
  }
  return {
    schema: POLICY_BASELINE_FIXTURE_SCHEMA,
    fixtureVersion: POLICY_BASELINE_FIXTURE_VERSION,
    sourceCommit: raw.sourceCommit,
    extractedFrom: "git-object",
    expectedCounts: {
      rules: counts.rules as number,
      params: counts.params as number,
      ruleSets: counts.ruleSets as number,
      packs: counts.packs as number,
    },
    contentSha256: raw.contentSha256,
    files,
  };
}

export function loadPolicyBaselineFixture(filePath: string): PolicyBaselineFixture {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new PolicyBaselineFixtureError(
      "FIXTURE_PATH_MISSING",
      `政策基线夹具不可读：${filePath}（${(err as Error).message}）`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new PolicyBaselineFixtureError("FIXTURE_INVALID", `政策基线夹具不是合法JSON：${(err as Error).message}`);
  }
  return parsePolicyBaselineFixture(raw);
}

/** 以夹具内容实现GitReader：与`git show <sourceCommit>:<path>`语义一致，未收录路径失败关闭。 */
export function fixtureGitReader(fixture: PolicyBaselineFixture): GitReader {
  return {
    showHead: (p: string): string => {
      if (p === "COMMIT") return fixture.sourceCommit;
      const content = fixture.files[p];
      if (content === undefined) {
        throw new PolicyBaselineFixtureError(
          "FIXTURE_PATH_MISSING",
          `政策基线夹具未收录路径 ${p}（sourceCommit ${fixture.sourceCommit}）`,
        );
      }
      return content;
    },
    listCommittedFiles: (dir: string): string[] => {
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      return Object.keys(fixture.files)
        .filter((p) => p.startsWith(prefix))
        .sort();
    },
    isWorktreeDirty: (): boolean => false,
  };
}

/** 用当前buildManifest重建基线manifest并核对四类计数（任一不符失败关闭）。 */
export function assertFixtureBaselineCounts(fixture: PolicyBaselineFixture): void {
  const manifest = buildManifest(fixtureGitReader(fixture));
  const actual = manifest.counts;
  const expected = fixture.expectedCounts;
  if (
    actual.rules !== expected.rules ||
    actual.params !== expected.params ||
    actual.ruleSets !== expected.ruleSets ||
    actual.packs !== expected.packs
  ) {
    throw new PolicyBaselineFixtureError(
      "FIXTURE_COUNTS_MISMATCH",
      `政策基线夹具 expectedCounts 不符：声明 ${JSON.stringify(expected)} 实际 ${JSON.stringify(actual)}`,
    );
  }
}
