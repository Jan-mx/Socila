/**
 * SHV2-AC-004（WI-20260911-01）：上海新政策版本只形成预期delta，其他地区零漂移。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向全新PG17+pgvector演练服务器（CI/DB门禁提供）。
 * 流程：
 *   1. 独立数据库执行migration；
 *   2. 以基线提交 d7fd63a（PRD确认基线）构建manifest并经真实 applyMaterialization
 *      物化四地区资产（模拟"SHV2之前的持久库"）；
 *   3. 以当前工作树构建manifest执行audit——计划必须只含上海
 *      （10规则v2 + 31参数窗口 + 1规则集v2 + 1包v2），CN/广东/四川零实体；
 *   4. apply后只有上海批次携带成员；复跑audit/apply均为no-op。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
const BASELINE_COMMIT = "d7fd63a0de5b4da7d48ea66445223ee51666e620";
const MAT_DB = "shv2_delta_mat";

let matUrl = "";
let drillPort = -1;

function requireDrill(): void {
  if (!DRILL_URL) {
    throw new Error(
      "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要全新PG17+pgvector演练库（CI database-gates自动提供）",
    );
  }
}

function gitReaderAt(commit: string) {
  return {
    showHead: (p: string): string =>
      p === "COMMIT"
        ? commit
        : execFileSync("git", ["show", `${commit}:${p}`], {
            cwd: process.cwd(),
            maxBuffer: 64 * 1024 * 1024,
          }).toString("utf8"),
    listCommittedFiles: (): string[] => [],
    isWorktreeDirty: (): boolean => false,
  };
}

function gitReaderWorktree() {
  return {
    showHead: (p: string): string =>
      p === "COMMIT"
        ? BASELINE_COMMIT.slice(0, 7)
        : readFileSync(path.join(process.cwd(), p), "utf8"),
    listCommittedFiles: (): string[] => [],
    isWorktreeDirty: (): boolean => false,
  };
}

async function adminClient(): Promise<Client> {
  const base = new URL(DRILL_URL!);
  drillPort = Number(base.port || 5432);
  base.pathname = "/postgres";
  const c = new Client({ connectionString: base.toString() });
  c.on("error", (err) => console.error("[test] admin client error:", err.message));
  await c.connect();
  return c;
}

async function matClient(): Promise<Client> {
  const c = new Client({ connectionString: matUrl });
  c.on("error", (err) => console.error("[test] mat client error:", err.message));
  await c.connect();
  return c;
}

async function matQuery(text: string, values: unknown[] = []) {
  const c = await matClient();
  try {
    return (await c.query(text, values)) as { rows: Record<string, unknown>[] };
  } finally {
    await c.end();
  }
}

function matOpts() {
  return { allowedDatabases: [MAT_DB], allowedPorts: [String(drillPort)] };
}

beforeAll(async () => {
  requireDrill();
  const admin = await adminClient();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${MAT_DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${MAT_DB}"`);
  } finally {
    await admin.end();
  }
  const base = new URL(DRILL_URL!);
  base.pathname = `/${MAT_DB}`;
  matUrl = base.toString();
  execFileSync("node", ["scripts/run-migrations.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: matUrl },
    stdio: "pipe",
  });
  process.env.DATABASE_URL = matUrl;
});

afterAll(async () => {
  if (!DRILL_URL || !matUrl) return;
  try {
    const admin = await adminClient();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${MAT_DB}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  } catch (err) {
    console.error("[test] teardown:", (err as Error).message);
  }
});

describe("SHV2-AC-004：上海delta隔离（基线d7fd63a镜像 → 当前仓库audit）", () => {
  it("基线四地区物化：26规则/46参数/4规则集/4包", async () => {
    const { buildManifest, manifestHash } = await import("./manifest");
    const { applyMaterialization, auditMaterialization } = await import("./materialize");
    const manifest = buildManifest(gitReaderAt(BASELINE_COMMIT));
    const hash = manifestHash(manifest);
    const audit = await auditMaterialization(manifest, true, matOpts());
    expect(audit.plan.counts).toEqual({ rules: 26, params: 46, ruleSets: 4, packs: 4 });
    const result = await applyMaterialization(
      {
        authorized: true,
        expectedManifestHash: hash,
        expectedTargetFingerprint: audit.targetFingerprint,
        manifest,
        worktreeClean: true,
        actor: "shv2-baseline-test",
        // 本演练库未seed业务语料，物化器只写政策资产——核对表仅含其控制的四类。
        expectedTotalCounts: {
          rules: 26,
          params: 46,
          rule_sets: 4,
          policy_pack_versions: 4,
        },
      },
      matOpts(),
    );
    expect(result.noop).toBe(false);
    // 本演练库未seed业务语料：只核对物化器控制的四类政策资产。
    expect(result.counts.rules).toBe(26);
    expect(result.counts.params).toBe(46);
    expect(result.counts.rule_sets).toBe(4);
    expect(result.counts.policy_pack_versions).toBe(4);
  });

  it("audit当前仓库：只规划上海delta（10规则+31参数+1规则集+1包），其他地区零实体", async () => {
    const { buildManifest } = await import("./manifest");
    const { auditMaterialization } = await import("./materialize");
    const current = buildManifest(gitReaderWorktree());
    const audit = await auditMaterialization(current, true, matOpts());
    const byJur = new Map(audit.plan.regions.map((r) => [r.jurisdictionCode, r]));
    for (const jur of ["CN", "440000", "510000"]) {
      expect(byJur.get(jur)!.counts, `${jur} 必须零新增`).toEqual({
        rules: 0,
        params: 0,
        ruleSets: 0,
        packs: 0,
      });
    }
    expect(byJur.get("310000")!.counts).toEqual({
      rules: 10,
      params: 31,
      ruleSets: 1,
      packs: 1,
    });
    // 上海实体全部以新版本进入（既有键v2起、新增键v1），包含SHV2新增业务键，
    // 不含已移除的transcript伪引用键。
    const shVersions = byJur.get("310000")!.versions;
    const versionByKey = new Map(shVersions.map((v) => [v.businessKey, v.version] as const));
    expect(versionByKey.get("R-SH-UI-AMOUNT")).toBe(1);
    expect(versionByKey.get("R-SH-FLEX-CONTRIBUTION")).toBe(1);
    expect(versionByKey.get("P-SH-4050-NEAR-RETIRE-THRESHOLD-YEARS")).toBe(1);
    expect(versionByKey.get("R-310-MI-WAITING-PERIOD")).toBe(2);
    expect(versionByKey.get("RS-SHANGHAI-PLAN-V1")).toBe(2);
    expect(versionByKey.has("T-SH-PAY-GAP-MONTHS")).toBe(false);
    expect(versionByKey.has("P-SH-PAY-GAP-AFFECTS-NEXT-MONTH")).toBe(false);
    // 基线published行零改写：audit为只读，既有上海v1行不受影响（版本化而非覆盖）。
    // 包快照漂移只含上海。
    expect(audit.packSnapshotDrift).toHaveLength(1);
    expect(audit.packSnapshotDrift[0]!.jurisdictionCode).toBe("310000");
    // 目标计数 = 基线 + 上海delta（本库未seed业务语料，其余表为0不核对）。
    expect(audit.expectedPostCounts.rules).toBe(36);
    expect(audit.expectedPostCounts.params).toBe(77);
    expect(audit.expectedPostCounts.rule_sets).toBe(5);
    expect(audit.expectedPostCounts.policy_pack_versions).toBe(5);
  });

  it("apply上海delta：只有上海批次携带成员；复跑audit/apply均no-op", async () => {
    const { buildManifest, manifestHash } = await import("./manifest");
    const { applyMaterialization, auditMaterialization } = await import("./materialize");
    const current = buildManifest(gitReaderWorktree());
    const hash = manifestHash(current);
    const audit = await auditMaterialization(current, true, matOpts());
    const result = await applyMaterialization(
      {
        authorized: true,
        expectedManifestHash: hash,
        expectedTargetFingerprint: audit.targetFingerprint,
        manifest: current,
        worktreeClean: true,
        actor: "shv2-delta-test",
        expectedTotalCounts: {
          rules: 36,
          params: 77,
          rule_sets: 5,
          policy_pack_versions: 5,
        },
      },
      matOpts(),
    );
    expect(result.noop).toBe(false);
    expect(result.counts.rules).toBe(36);
    expect(result.counts.params).toBe(77);
    expect(result.counts.rule_sets).toBe(5);
    expect(result.counts.policy_pack_versions).toBe(5);

    const c = await matClient();
    try {
      const batches = await c.query(
        `select jurisdiction_code, entity_counts from policy_import_batches
         where manifest_hash = $1 order by id`,
        [hash],
      );
      expect(batches.rows).toHaveLength(4);
      const byJur = new Map(
        batches.rows.map((r) => [r.jurisdiction_code as string, r]),
      );
      expect(byJur.get("310000")!.entity_counts).toEqual({
        rules: 10,
        params: 31,
        ruleSets: 1,
        packs: 1,
      });
      for (const jur of ["CN", "440000", "510000"]) {
        expect(byJur.get(jur)!.entity_counts).toEqual({
          rules: 0,
          params: 0,
          ruleSets: 0,
          packs: 0,
        });
      }
    } finally {
      await c.end();
    }

    // 复跑audit与apply：同一内容全部收敛为no-op。
    const audit2 = await auditMaterialization(current, true, matOpts());
    expect(audit2.idempotentNoOp).toBe(true);
    expect(audit2.plan.counts).toEqual({ rules: 0, params: 0, ruleSets: 0, packs: 0 });
    const result2 = await applyMaterialization(
      {
        authorized: true,
        expectedManifestHash: manifestHash(current),
        expectedTargetFingerprint: audit2.targetFingerprint,
        manifest: current,
        worktreeClean: true,
        actor: "shv2-delta-test",
      },
      matOpts(),
    );
    expect(result2.noop).toBe(true);
    void hash;
  });
});
