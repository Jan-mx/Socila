/**
 * NRP-AC-011/013/014/015（阶段E物化落库面）：
 * 在演练容器中创建独立数据库（nrp_e_mat），安装合成"旧上海运行基线"
 * （24条published规则、29个published参数、1个published规则集、528/851/117
 * 案例测试计数），然后验证：
 * - AC-011：缺授权/错manifest哈希/错指纹 → 拒绝且零写入；
 * - AC-013：CN/粤/川v1、上海既有键v2、新键v1、旧行内容不变、全部draft；
 * - AC-014：同manifest重复apply → no-op；计数不符 → 单事务回滚；
 * - AC-015：固定计数49/70/5/4且528/851/117/0不变；GD/SC blocked、SC规则0。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
// 每次运行动态库名：避免与陈旧worker的延迟DROP DATABASE互相干扰。
const MAT_DB = `nrp_e_mat_${Date.now().toString(36)}`;

let matUrl = "";
let oldRowsHashBefore = "";

const LEGACY_RULE_KEYS = [
  "R-010-PARSE-BIRTH-YEAR",
  "R-011-BUILD-BIRTH-DATE",
  "R-012-NORMALIZE-GENDER",
  "R-020-FEMALE-RETIRE-TYPE",
  "R-110-LOOKUP-LEGAL-RETIRE-AGE",
  "R-115-FLEXIBLE-RETIREMENT",
  "R-120-COMPUTE-RETIRE-DATE",
  "R-200-MIN-PENSION-YEARS",
  "R-210-PENSION-GAP",
  "R-220-MEDICAL-LIFETIME-GAP",
  "R-300-MI-GAP-MONTHS",
  "R-310-MI-WAITING-PERIOD",
  "R-400-UNEMPLOYMENT-ELIGIBILITY",
  "R-410-UNEMPLOYMENT-DURATION",
  "R-420-UI-MEDICAL-COVERAGE",
  "R-500-4050-ELIGIBILITY",
  "R-510-4050-AMOUNT",
  "R-520-JOB-SUBSIDY-ELIGIBILITY",
  "R-521-JOB-SUBSIDY-AMOUNT",
  "R-530-OLDER-UI-PENSION-FUND-COVERAGE",
  "R-540-SUBSIDY-MUTUAL-EXCLUSION",
  "R-600-PAY-GAP-REMINDER",
  "R-700-PLAN-TEMPLATE",
  "R-900-FINAL-GATE",
];

const LEGACY_PARAM_IDS = [
  "P-SH-CONTRIB-BASE-LOWER",
  "P-SH-CONTRIB-BASE-UPPER",
  "P-SH-PENSION-RATE-EMPLOYER",
  "P-SH-PENSION-RATE-EMPLOYEE",
  "P-SH-PENSION-RATE-FLEX",
  "P-SH-MEDICAL-RATE-EMPLOYER",
  "P-SH-MEDICAL-RATE-EMPLOYEE",
  "P-SH-MEDICAL-RATE-FLEX",
  "P-SH-UNEMPLOYMENT-RATE-EMPLOYER",
  "P-SH-UNEMPLOYMENT-RATE-EMPLOYEE",
  "P-SH-MI-WAITING-PERIOD-MONTHS",
  "P-SH-MI-GAP-WAIVER-MONTHS",
  "P-SH-4050-SUBSIDY-RATE",
  "P-SH-4050-MAX-YEARS-GENERAL",
  "P-SH-4050-MAX-YEARS-NEAR-RETIRE",
  "P-SH-JOB-SUBSIDY-RATE-MINWAGE",
  "P-SH-UNEMPLOYMENT-MAX-MONTHS",
  "P-SH-UNEMPLOYMENT-BENEFIT-TIER1",
  "P-SH-UNEMPLOYMENT-BENEFIT-TIER2",
  "P-SH-UNEMPLOYMENT-BENEFIT-EXTENDED",
  "P-SH-MEDICAL-LIFETIME-REQUIRED-YEARS",
  "P-SH-MEDICAL-LIFETIME-MALE-YEARS",
  "P-SH-MEDICAL-LIFETIME-FEMALE-YEARS",
  "P-SH-PAY-GAP-AFFECTS-NEXT-MONTH",
  "P-SH-MIN-WAGE",
  "T-SH-PAY-GAP-MONTHS",
  "T-SH-UNEMPLOYMENT-DURATION-BY-YEARS",
  "T-MIN-PENSION-YEARS-BY-RETIRE-YEAR",
  "T-RETIREMENT-AGE-LOOKUP",
];

async function adminClient(): Promise<Client> {
  const base = new URL(DRILL_URL!);
  base.pathname = "/postgres";
  const c = new Client({ connectionString: base.toString() });
  await c.connect();
  return c;
}

async function matClient(): Promise<Client> {
  const c = new Client({ connectionString: matUrl });
  await c.connect();
  return c;
}

async function setupDatabase(): Promise<void> {
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

  // 显式DATABASE_URL运行migration（NRP-FR-017：禁止dotenv回退）。
  execFileSync("node", ["scripts/run-migrations.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: matUrl },
    stdio: "pipe",
  });

  // 安装合成旧上海运行基线。
  const c = await matClient();
  try {
    for (const key of LEGACY_RULE_KEYS) {
      await c.query(
        `insert into rules (rule_id, jurisdiction_code, business_key, name, module,
           dsl_version, priority, status, effective_from, decision_table, version, operation)
         values ($1,'310000',$1,$1,'test','SOCILA-DSL-1.0',0,'published','2024-01-01',
                 '{"hit_policy":"first","rows":[]}'::jsonb,1,'add')`,
        [key],
      );
    }
    let i = 0;
    for (const id of LEGACY_PARAM_IDS) {
      i += 1;
      const isTable = id.startsWith("T-");
      await c.query(
        `insert into params (policy_pack_id, jurisdiction_code, business_key, param_id,
           type, value, rows, status, effective_from, version, operation)
         values ('SHANGHAI_BASE','310000',$1,$1,$2,$3,$4,'published','2024-01-01',1,'add')`,
        [
          id,
          isTable ? "table" : "number",
          isTable ? null : i,
          isTable
            ? JSON.stringify([{ insured_years_min: 1, insured_years_max: 5, months: 12 }])
            : null,
        ],
      );
    }
    await c.query(
      `insert into rule_sets (rule_set_id, jurisdiction_code, status, effective_from, rules, version, operation)
       values ('RS-SHANGHAI-PLAN-V1','310000','published','2024-01-01',$1::jsonb,1,'add')`,
      [JSON.stringify(LEGACY_RULE_KEYS)],
    );
    // 案例与测试计数基线（528/851/117）。
    await c.query(
      `insert into tests (name, input, expected)
       select 'legacy-test-'||g, '{}'::jsonb, '{}'::jsonb from generate_series(1,528) g`,
    );
    await c.query(
      `insert into cases (case_uid) select 'legacy-case-'||g from generate_series(1,851) g`,
    );
    await c.query(
      `insert into showcase_cases (title, user_message, ai_response)
       select 'legacy-show-'||g, 'u', 'a' from generate_series(1,117) g`,
    );

    const counts = await c.query(
      `select
         (select count(*)::int from rules where status='published') as rules,
         (select count(*)::int from params where status='published') as params,
         (select count(*)::int from rule_sets where status='published') as rule_sets,
         (select count(*)::int from tests) as tests,
         (select count(*)::int from cases) as cases,
         (select count(*)::int from showcase_cases) as showcase`,
    );
    expect(counts.rows[0]).toEqual({
      rules: 24,
      params: 29,
      rule_sets: 1,
      tests: 528,
      cases: 851,
      showcase: 117,
    });
  } finally {
    await c.end();
  }
}

describe("阶段E物化（独立nrp_e_mat库，NRP-AC-011/013/014/015）", () => {
  beforeAll(async () => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置（CI database-gates 自动提供）",
      );
    }
    await setupDatabase();
    process.env.DATABASE_URL = matUrl;
    // 记录物化前published行哈希（旧行保护基线）。
    const { loadExistingState } = await import(
      "@/lib/policy-materialization/target"
    );
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: matUrl });
    await client.connect();
    try {
      const state = await loadExistingState({
        query: async (text) => (await client.query(text)) as { rows: Record<string, unknown>[] },
      });
      oldRowsHashBefore = state.publishedRowsHash;
    } finally {
      await client.end();
    }
  }, 120_000);

  afterAll(async () => {
    const admin = await adminClient();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${MAT_DB} WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });

  it("AC-011：缺授权/错manifest哈希/错指纹 → 拒绝且持久库零写入", async () => {
    const { buildManifest, manifestHash } = await import(
      "@/lib/policy-materialization/manifest"
    );
    const { applyMaterialization, auditMaterialization, ApplyGuardError } =
      await import("@/lib/policy-materialization/materialize");
    const manifest = buildManifest({
      showHead: (p) =>
        p === "COMMIT"
          ? "mat-test-commit"
          : readFileSync(path.join(process.cwd(), p), "utf8"),
      listCommittedFiles: () => [],
      isWorktreeDirty: () => false,
    });
    const hash = manifestHash(manifest);
    const audit = await auditMaterialization(manifest, true, {
      allowedDatabases: [MAT_DB],
      allowedPorts: ['5439'],
    });
    const fp = audit.targetFingerprint;

    const countsBefore = await (
      await matClient()
    ).query(`select
        (select count(*)::int from rules) as rules,
        (select count(*)::int from policy_import_batches) as batches`);

    // 缺授权。
    await expect(
      applyMaterialization(
        {
          authorized: false,
          expectedManifestHash: hash,
          expectedTargetFingerprint: fp,
          manifest,
          worktreeClean: true,
          actor: "test",
        },
        { allowedDatabases: [MAT_DB], allowedPorts: ["5439"] },
      ),
    ).rejects.toMatchObject({ reason: "UNAUTHORIZED" });

    // 错manifest哈希。
    await expect(
      applyMaterialization(
        {
          authorized: true,
          expectedManifestHash: "deadbeef",
          expectedTargetFingerprint: fp,
          manifest,
          worktreeClean: true,
          actor: "test",
        },
        { allowedDatabases: [MAT_DB], allowedPorts: ["5439"] },
      ),
    ).rejects.toMatchObject({ reason: "MANIFEST_MISMATCH" });

    // 错目标指纹。
    await expect(
      applyMaterialization(
        {
          authorized: true,
          expectedManifestHash: hash,
          expectedTargetFingerprint: "wrong-fp",
          manifest,
          worktreeClean: true,
          actor: "test",
        },
        { allowedDatabases: [MAT_DB], allowedPorts: ["5439"] },
      ),
    ).rejects.toMatchObject({ reason: "FINGERPRINT_MISMATCH" });

    // 零写入。
    const countsAfter = await (
      await matClient()
    ).query(`select
        (select count(*)::int from rules) as rules,
        (select count(*)::int from policy_import_batches) as batches`);
    expect(countsAfter.rows[0]).toEqual(countsBefore.rows[0]);
  });

  it("AC-013/015：apply → CN/粤/川v1、上海既有键v2、新键v1、固定计数、blocked语义", async () => {
    const { buildManifest, manifestHash } = await import(
      "@/lib/policy-materialization/manifest"
    );
    const { applyMaterialization, auditMaterialization } = await import(
      "@/lib/policy-materialization/materialize"
    );
    const manifest = buildManifest({
      showHead: (p) =>
        p === "COMMIT"
          ? "mat-test-commit"
          : readFileSync(path.join(process.cwd(), p), "utf8"),
      listCommittedFiles: () => [],
      isWorktreeDirty: () => false,
    });
    const hash = manifestHash(manifest);
    const audit = await auditMaterialization(manifest, true, {
      allowedDatabases: [MAT_DB],
      allowedPorts: ['5439'],
    });

    const result = await applyMaterialization(
      {
        authorized: true,
        expectedManifestHash: hash,
        expectedTargetFingerprint: audit.targetFingerprint,
        manifest,
        worktreeClean: true,
        actor: "stage-e-test",
      },
      { allowedDatabases: [MAT_DB], allowedPorts: ["5439"] },
    );
    expect(result.noop).toBe(false);
    expect(result.publishedRowsHashBefore).toBe(oldRowsHashBefore);
    expect(result.publishedRowsHashAfter).toBe(oldRowsHashBefore);

    // 固定计数（NRP-AC-015）。
    expect(result.counts).toEqual({
      rules: 49,
      params: 70,
      rule_sets: 5,
      policy_pack_versions: 4,
      tests: 528,
      cases: 851,
      showcase_cases: 117,
      policy_snapshots: 0,
    });

    const c = await matClient();
    try {
      // 批次就绪语义（NRP-FR-022）。
      const batches = await c.query(
        `select jurisdiction_code, readiness, blocking_reasons, entity_counts
         from policy_import_batches order by id`,
      );
      expect(batches.rows).toHaveLength(4);
      const byJur = new Map(
        batches.rows.map((r) => [r.jurisdiction_code as string, r]),
      );
      expect(byJur.get("CN")!.readiness).toBe("awaiting_approval");
      expect(byJur.get("310000")!.readiness).toBe("awaiting_approval");
      expect(byJur.get("440000")!.readiness).toBe("blocked");
      expect(byJur.get("510000")!.readiness).toBe("blocked");
      expect(
        (byJur.get("510000")!.entity_counts as { rules: number }).rules,
      ).toBe(0);
      expect(
        byJur.get("510000")!.blocking_reasons as string[],
      ).toHaveLength(3);

      // 版本语义（NRP-AC-013）：CN/粤/川v1；上海既有键v2、新键v1。
      const versions = await c.query(
        `select jurisdiction_code, business_key, version, status from (
           select jurisdiction_code, rule_id as business_key, version, status from rules
           union all select jurisdiction_code, param_id, version, status from params
           union all select jurisdiction_code, rule_set_id, version, status from rule_sets
         ) v
         where (jurisdiction_code, business_key) in
           (('CN','R-110-LOOKUP-LEGAL-RETIRE-AGE'), ('CN','R-200-MIN-PENSION-YEARS'),
            ('440000','R-GD-MI-RETIRE-RESTRICT'), ('510000','RS-SC-PLAN-V1'),
            ('310000','R-500-4050-ELIGIBILITY'), ('310000','R-310-MI-WAITING-PERIOD'),
            ('310000','P-MI-LIFETIME-MALE-YEARS'), ('310000','P-SH-MIN-WAGE'),
            ('310000','RS-SHANGHAI-PLAN-V1'))
         order by jurisdiction_code, business_key, version`,
      );
      const vMap = new Map(
        versions.rows.map(
          (r) =>
            [`${r.jurisdiction_code}|${r.business_key}|${r.version}`, r.status] as const,
        ),
      );
      // CN/粤/川首次v1（draft）。
      expect(vMap.get("CN|R-110-LOOKUP-LEGAL-RETIRE-AGE|1")).toBe("draft");
      expect(vMap.get("CN|R-200-MIN-PENSION-YEARS|1")).toBe("draft");
      expect(vMap.get("440000|R-GD-MI-RETIRE-RESTRICT|1")).toBe("draft");
      expect(vMap.get("510000|RS-SC-PLAN-V1|1")).toBe("draft");
      // 上海既有键v2、新键v1（全部draft）。
      expect(vMap.get("310000|R-500-4050-ELIGIBILITY|2")).toBe("draft");
      expect(vMap.get("310000|R-310-MI-WAITING-PERIOD|2")).toBe("draft");
      expect(vMap.get("310000|P-MI-LIFETIME-MALE-YEARS|1")).toBe("draft");
      expect(vMap.get("310000|P-SH-MIN-WAGE|2")).toBe("draft");
      expect(vMap.get("310000|RS-SHANGHAI-PLAN-V1|2")).toBe("draft");

      // 旧published行原样存在（内容不变，仅新增draft行）。
      const oldRule = await c.query(
        `select status, version, count(*)::int as n from rules
         where jurisdiction_code='310000' and rule_id='R-500-4050-ELIGIBILITY'
         group by 1,2 order by 2`,
      );
      expect(oldRule.rows).toEqual([
        { status: "published", version: 1, n: 1 },
        { status: "draft", version: 2, n: 1 },
      ]);
      const oldParam = await c.query(
        `select status, version, value from params
         where jurisdiction_code='310000' and param_id='P-SH-MIN-WAGE'
         order by version`,
      );
      expect(oldParam.rows).toHaveLength(2);
      expect(oldParam.rows[0].status).toBe("published");
      expect(oldParam.rows[0].version).toBe(1);
      expect(oldParam.rows[1].status).toBe("draft");

      // 新draft不改变published计数。
      const published = await c.query(
        `select
           (select count(*)::int from rules where status='published') as rules,
           (select count(*)::int from params where status='published') as params`,
      );
      expect(published.rows[0]).toEqual({ rules: 24, params: 29 });

      // 参数evidence已保存（NRP-FR-020）。
      const evidence = await c.query(
        `select evidence from params
         where jurisdiction_code='CN' and param_id='T-UNEMPLOYMENT-DURATION-BY-YEARS'`,
      );
      const ev = evidence.rows[0].evidence as Array<Record<string, unknown>>;
      expect(ev.length).toBeGreaterThan(0);
      expect(ev[0].content_sha256).toBeTruthy();

      // 批次成员审计与内容哈希（NRP-FR-019）。
      const members = await c.query(
        `select count(*)::int as n from policy_import_batch_members m
         join policy_import_batches b on b.id=m.batch_id
         where b.jurisdiction_code='CN'`,
      );
      // CN：16规则+6参数+1规则集+1包=24成员。
      expect(members.rows[0].n).toBe(24);
    } finally {
      await c.end();
    }
  });

  it("AC-014：同manifest重复apply → no-op；计数不符 → 单事务回滚", async () => {
    const { buildManifest, manifestHash } = await import(
      "@/lib/policy-materialization/manifest"
    );
    const { applyMaterialization } = await import(
      "@/lib/policy-materialization/materialize"
    );
    const manifest = buildManifest({
      showHead: (p) =>
        p === "COMMIT"
          ? "mat-test-commit"
          : readFileSync(path.join(process.cwd(), p), "utf8"),
      listCommittedFiles: () => [],
      isWorktreeDirty: () => false,
    });
    const hash = manifestHash(manifest);
    const before = await (await matClient()).query(
      `select
         (select count(*)::int from rules) as rules,
         (select count(*)::int from params) as params,
         (select count(*)::int from policy_import_batches) as batches`,
    );

    // 幂等no-op。
    const noop = await applyMaterialization(
      {
        authorized: true,
        expectedManifestHash: hash,
        // 指纹在物化后已变化（计数变了）——但幂等no-op应在指纹校验之后判定；
        // 这里传当前真实指纹：重新audit取得。
        expectedTargetFingerprint: (
          await (
            await import("@/lib/policy-materialization/materialize")
          ).auditMaterialization(manifest, true, { allowedDatabases: [MAT_DB], allowedPorts: ["5439"] })
        ).targetFingerprint,
        manifest,
        worktreeClean: true,
        actor: "stage-e-test",
      },
      { allowedDatabases: [MAT_DB], allowedPorts: ["5439"] },
    );
    expect(noop.noop).toBe(true);

    // 计数不符 → 事务回滚（篡改manifest多塞一个参数）。
    const tampered = structuredClone(manifest);
    const cn = tampered.regions.find((r) => r.jurisdictionCode === "CN")!;
    cn.params.push({
      businessKey: "P-CN-EXTRA",
      kind: "scalar",
      contentHash: "x",
      payload: { param_id: "P-CN-EXTRA", type: "number", value: 1, operation: "baseline" },
    });
    const tamperedHash = manifestHash(tampered);
    const fpNow = (
      await (
        await import("@/lib/policy-materialization/materialize")
      ).auditMaterialization(manifest, true, { allowedDatabases: [MAT_DB], allowedPorts: ["5439"] })
    ).targetFingerprint;
    await expect(
      applyMaterialization(
        {
          authorized: true,
          expectedManifestHash: tamperedHash,
          expectedTargetFingerprint: fpNow,
          manifest: tampered,
          worktreeClean: true,
          actor: "test",
        },
        { allowedDatabases: [MAT_DB], allowedPorts: ["5439"] },
      ),
    ).rejects.toThrow(/全部回滚/);

    const after = await (await matClient()).query(
      `select
         (select count(*)::int from rules) as rules,
         (select count(*)::int from params) as params,
         (select count(*)::int from policy_import_batches) as batches`,
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
