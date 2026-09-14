/**
 * WI-20260914-01 CIG-FR-003/004（PMG-FR-022/NFR-001）：政策基线夹具契约。
 *
 * CI #23 database-gates根因：`shv2-shanghai-delta.integration.test.ts`以
 * `git show d7fd63a…:path`读取基线DSL，而squash后的`main`不可达该历史对象。
 * 基线内容改为版本化夹具`__fixtures__/policy-baseline-d7fd63a.json`（一次性从
 * 本地Git对象只读提取），加载时校验schema/版本/sourceCommit/内容SHA-256/预期计数，
 * 任一不符即失败关闭；测试不再依赖任何Git历史对象。
 *
 * 纯单元：零数据库、零子进程。
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY_BASELINE_FIXTURE_PATH,
  POLICY_BASELINE_FIXTURE_SCHEMA,
  POLICY_BASELINE_FIXTURE_VERSION,
  PolicyBaselineFixtureError,
  assertFixtureBaselineCounts,
  fixtureContentSha256,
  fixtureGitReader,
  loadPolicyBaselineFixture,
  parsePolicyBaselineFixture,
} from "./baseline-fixture";
import { buildManifest, manifestHash } from "./manifest";

const BASELINE_COMMIT = "d7fd63a0de5b4da7d48ea66445223ee51666e620";

describe("政策基线夹具（CIG-FR-003：schema/来源/SHA-256/计数）", () => {
  const fixture = loadPolicyBaselineFixture(DEFAULT_POLICY_BASELINE_FIXTURE_PATH);

  it("已提交夹具声明schema、版本与来源提交", () => {
    expect(fixture.schema).toBe(POLICY_BASELINE_FIXTURE_SCHEMA);
    expect(fixture.fixtureVersion).toBe(POLICY_BASELINE_FIXTURE_VERSION);
    expect(fixture.sourceCommit).toBe(BASELINE_COMMIT);
    expect(fixture.extractedFrom).toBe("git-object");
  });

  it("contentSha256等于files映射规范化JSON的SHA-256（加载已核对）", () => {
    expect(fixture.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fixtureContentSha256(fixture.files)).toBe(fixture.contentSha256);
  });

  it("夹具覆盖四地区manifest/rules/params/rule_set全部文件且不含tests文件", () => {
    const paths = Object.keys(fixture.files);
    for (const dir of [
      "dsl/regions/cn_dsl_v1",
      "dsl/regions/guangdong_dsl_v1",
      "dsl/regions/sichuan_dsl_v1",
      "dsl/regions/shanghai_dsl_v1",
    ]) {
      expect(paths).toContain(`${dir}/rules_manifest.json`);
      const manifest = JSON.parse(fixture.files[`${dir}/rules_manifest.json`]!) as {
        rules: Array<{ file: string }>;
        params_file: string;
        rule_set_file: string;
      };
      for (const r of manifest.rules) expect(paths).toContain(`${dir}/rules/${r.file}`);
      expect(paths).toContain(`${dir}/${manifest.params_file}`);
      expect(paths).toContain(`${dir}/${manifest.rule_set_file}`);
    }
    expect(paths.some((p) => p.includes("/tests/"))).toBe(false);
  });

  it("以夹具构建的基线manifest计数=26规则/46参数/4规则集/4包（SHV2-AC-004基线）", () => {
    expect(fixture.expectedCounts).toEqual({ rules: 26, params: 46, ruleSets: 4, packs: 4 });
    const manifest = buildManifest(fixtureGitReader(fixture));
    expect(manifest.sourceCommit).toBe(BASELINE_COMMIT);
    expect(manifest.counts).toEqual(fixture.expectedCounts);
    expect(() => assertFixtureBaselineCounts(fixture)).not.toThrow();
    // 同一夹具两次构建manifestHash恒定（确定性）。
    expect(manifestHash(manifest)).toBe(manifestHash(buildManifest(fixtureGitReader(fixture))));
  });

  it("fixtureGitReader：COMMIT返回来源提交；未收录路径失败关闭；listCommittedFiles按目录枚举", () => {
    const reader = fixtureGitReader(fixture);
    expect(reader.showHead("COMMIT")).toBe(BASELINE_COMMIT);
    expect(() => reader.showHead("dsl/regions/cn_dsl_v1/tests/not-in-fixture.json")).toThrow(
      PolicyBaselineFixtureError,
    );
    expect(reader.isWorktreeDirty("dsl/regions/cn_dsl_v1")).toBe(false);
    const cnFiles = reader.listCommittedFiles("dsl/regions/cn_dsl_v1");
    expect(cnFiles).toContain("dsl/regions/cn_dsl_v1/rules_manifest.json");
    expect(cnFiles.every((p) => p.startsWith("dsl/regions/cn_dsl_v1/"))).toBe(true);
  });
});

describe("政策基线夹具失败关闭（CIG-AC-004）", () => {
  const good = loadPolicyBaselineFixture(DEFAULT_POLICY_BASELINE_FIXTURE_PATH);
  const clone = () => JSON.parse(JSON.stringify(good)) as typeof good;

  it("任一文件内容被篡改 → contentSha256不符拒绝", () => {
    const bad = clone();
    const key = "dsl/regions/shanghai_dsl_v1/rules_manifest.json";
    bad.files[key] = bad.files[key]!.replace("310000", "310001");
    expect(() => parsePolicyBaselineFixture(bad)).toThrow(/contentSha256/);
  });

  it("声明的contentSha256被改写 → 拒绝", () => {
    const bad = clone();
    bad.contentSha256 = "0".repeat(64);
    expect(() => parsePolicyBaselineFixture(bad)).toThrow(PolicyBaselineFixtureError);
  });

  it("schema/版本/sourceCommit非法 → 拒绝并指明字段", () => {
    const badSchema = clone();
    (badSchema as { schema: string }).schema = "other";
    expect(() => parsePolicyBaselineFixture(badSchema)).toThrow(/schema/);
    const badVersion = clone();
    (badVersion as { fixtureVersion: number }).fixtureVersion = 99;
    expect(() => parsePolicyBaselineFixture(badVersion)).toThrow(/fixtureVersion/);
    const badCommit = clone();
    badCommit.sourceCommit = "d7fd63a";
    expect(() => parsePolicyBaselineFixture(badCommit)).toThrow(/sourceCommit/);
  });

  it("expectedCounts与实际构建不符 → assertFixtureBaselineCounts拒绝", () => {
    const bad = clone();
    bad.expectedCounts = { ...bad.expectedCounts, rules: 27 };
    // 计数不进入contentSha256（files映射之外），需由计数校验单独拦截。
    const parsed = parsePolicyBaselineFixture(bad);
    expect(() => assertFixtureBaselineCounts(parsed)).toThrow(/expectedCounts/);
  });

  it("files缺少manifest引用的规则文件 → 构建manifest失败关闭", () => {
    const bad = clone();
    const manifest = JSON.parse(bad.files["dsl/regions/cn_dsl_v1/rules_manifest.json"]!) as {
      rules: Array<{ file: string }>;
    };
    delete bad.files[`dsl/regions/cn_dsl_v1/rules/${manifest.rules[0]!.file}`];
    bad.contentSha256 = fixtureContentSha256(bad.files);
    const parsed = parsePolicyBaselineFixture(bad);
    expect(() => buildManifest(fixtureGitReader(parsed))).toThrow(PolicyBaselineFixtureError);
  });

  it("非对象输入 → 拒绝", () => {
    expect(() => parsePolicyBaselineFixture(null)).toThrow(PolicyBaselineFixtureError);
    expect(() => parsePolicyBaselineFixture("x")).toThrow(PolicyBaselineFixtureError);
  });
});
