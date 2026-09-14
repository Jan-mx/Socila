/**
 * 政策基线夹具提取（WI-20260914-01 CIG-FR-003）。
 *
 * 只读地从本地Git对象提取指定提交的四地区DSL物化输入文件
 * （rules_manifest.json、rules/*、params_file、rule_set_file；不含tests），
 * 固化为版本化夹具JSON：schema、fixtureVersion、sourceCommit、extractedFrom、
 * expectedCounts（用当前buildManifest重建得到）、contentSha256（files规范化JSON SHA-256）。
 *
 * 用法：
 *   npx tsx scripts/build-policy-baseline-fixture.ts \
 *     --commit d7fd63a0de5b4da7d48ea66445223ee51666e620 \
 *     --out src/lib/policy-materialization/__fixtures__/policy-baseline-d7fd63a.json
 *
 * 前提：本机对象库可达该提交（历史开发分支）。CI与fresh clone不需要运行本脚本，
 * 只读取已提交的夹具。脚本不写Git、不写数据库。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  POLICY_BASELINE_FIXTURE_SCHEMA,
  POLICY_BASELINE_FIXTURE_VERSION,
  fixtureContentSha256,
  fixtureGitReader,
  parsePolicyBaselineFixture,
  type PolicyBaselineFixture,
} from "@/lib/policy-materialization/baseline-fixture";
import { REGION_DIRS, buildManifest } from "@/lib/policy-materialization/manifest";

function argOf(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const commitArg = argOf("--commit");
const outArg = argOf("--out");
if (!commitArg || !outArg) {
  console.error("用法：--commit <sha> --out <fixture.json>");
  process.exit(2);
}

// 解析为完整SHA并确认对象可达（只读）。
const sourceCommit = execFileSync("git", ["rev-parse", "--verify", `${commitArg}^{commit}`], {
  cwd: process.cwd(),
  encoding: "utf8",
}).trim();

function gitShow(p: string): string {
  return execFileSync("git", ["show", `${sourceCommit}:${p}`], {
    cwd: process.cwd(),
    maxBuffer: 64 * 1024 * 1024,
  }).toString("utf8");
}

const files: Record<string, string> = {};
for (const { dir } of REGION_DIRS) {
  const manifestPath = `${dir}/rules_manifest.json`;
  const manifestRaw = gitShow(manifestPath);
  files[manifestPath] = manifestRaw;
  const manifest = JSON.parse(manifestRaw) as {
    rules: Array<{ file: string }>;
    params_file: string;
    rule_set_file: string;
  };
  for (const entry of manifest.rules) {
    const p = `${dir}/rules/${entry.file}`;
    files[p] = gitShow(p);
  }
  files[`${dir}/${manifest.params_file}`] = gitShow(`${dir}/${manifest.params_file}`);
  files[`${dir}/${manifest.rule_set_file}`] = gitShow(`${dir}/${manifest.rule_set_file}`);
}

const draft: PolicyBaselineFixture = {
  schema: POLICY_BASELINE_FIXTURE_SCHEMA,
  fixtureVersion: POLICY_BASELINE_FIXTURE_VERSION,
  sourceCommit,
  extractedFrom: "git-object",
  expectedCounts: { rules: 0, params: 0, ruleSets: 0, packs: 0 },
  contentSha256: fixtureContentSha256(files),
  files,
};
const manifest = buildManifest(fixtureGitReader(draft));
const fixture: PolicyBaselineFixture = { ...draft, expectedCounts: manifest.counts };
// 自校验：写出前必须能被加载器无差错解析。
parsePolicyBaselineFixture(JSON.parse(JSON.stringify(fixture)));

const outPath = resolve(process.cwd(), outArg);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      out: outPath,
      sourceCommit,
      files: Object.keys(files).length,
      contentSha256: fixture.contentSha256,
      expectedCounts: fixture.expectedCounts,
    },
    null,
    2,
  ),
);
