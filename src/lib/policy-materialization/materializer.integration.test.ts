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
  // teardown删库时服务器可能强制终止连接：挂error监听避免uncaughtException击穿
  // 测试进程（查询期错误仍经由query promise拒绝暴露，不受影响）。
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

/** 一次性查询辅助：创建→查询→必须end（裸`(await matClient()).query`会泄漏连接）。 */
async function matQuery(
  text: string,
  values: unknown[] = [],
): Promise<{ rows: Record<string, unknown>[] }> {
  const c = await matClient();
  try {
    return (await c.query(text, values)) as { rows: Record<string, unknown>[] };
  } finally {
    await c.end();
  }
}

// ─── WI-20260906-01 repair集成测试基础设施 ────────────────────────────────────

/** 模拟持久库现状：4个draft政策包保存旧版不完整快照（漂移）。
 * 每个repair场景使用不同损坏载荷：确定性repair批次哈希由"旧内容哈希"参与生成，
 * 同一损坏内容重复修复会命中0014唯一约束（规格行为=报错），夹具必须可区分。 */
const CORRUPT_SNAPSHOT = [{ paramId: "legacy-incomplete", value: 1 }];
const CORRUPT_SNAPSHOT_ROLLBACK = [{ paramId: "legacy-incomplete-rollback", value: 2 }];
const CORRUPT_SNAPSHOT_CONCURRENT = [{ paramId: "legacy-incomplete-concurrent", value: 3 }];

function repairOpts(): { allowedDatabases: string[]; allowedPorts: string[] } {
  return { allowedDatabases: [MAT_DB], allowedPorts: ["5439"] };
}

/** repair测试依赖（manifest/哈希/repair函数）——动态导入与既有测试一致。 */
async function repairDeps() {
  const { buildManifest, manifestHash } = await import(
    "@/lib/policy-materialization/manifest"
  );
  const { buildPackSnapshotPayload } = await import(
    "@/lib/policy-materialization/plan"
  );
  const { canonicalJson } = await import("@/lib/policy-materialization/target");
  const materialize = await import("@/lib/policy-materialization/materialize");
  const manifest = buildManifest({
    showHead: (p) =>
      p === "COMMIT"
        ? "mat-test-commit"
        : readFileSync(path.join(process.cwd(), p), "utf8"),
    listCommittedFiles: () => [],
    isWorktreeDirty: () => false,
  });
  return {
    manifest,
    hash: manifestHash(manifest),
    buildPackSnapshotPayload,
    canonicalJson,
    ...materialize,
  };
}

interface PackRowInfo {
  rowId: number;
  jur: string;
  version: number;
  status: string;
  snapshot: unknown;
}

interface DbSnapshot {
  batches: number;
  members: number;
  packs: PackRowInfo[];
  memberHashes: Array<{ id: number; hash: string }>;
  counts: Record<string, number>;
  publishedHash: string;
}

async function dbSnapshot(): Promise<DbSnapshot> {
  const { loadExistingState } = await import(
    "@/lib/policy-materialization/target"
  );
  const c = await matClient();
  try {
    const agg = await c.query(
      `select
         (select count(*)::int from policy_import_batches) as batches,
         (select count(*)::int from policy_import_batch_members) as members,
         (select count(*)::int from rules) as rules,
         (select count(*)::int from params) as params,
         (select count(*)::int from rule_sets) as rule_sets,
         (select count(*)::int from policy_pack_versions) as packs,
         (select count(*)::int from tests) as tests,
         (select count(*)::int from cases) as cases,
         (select count(*)::int from showcase_cases) as showcase,
         (select count(*)::int from policy_snapshots) as snapshots`,
    );
    const packs = await c.query(
      `select id as row_id, jurisdiction_code as jur, version, status,
              param_snapshot as snapshot
       from policy_pack_versions order by id`,
    );
    const memberHashes = await c.query(
      `select id, content_hash as hash from policy_import_batch_members order by id`,
    );
    const state = await loadExistingState({
      query: async (text) =>
        (await c.query(text)) as { rows: Record<string, unknown>[] },
    });
    return {
      batches: agg.rows[0].batches,
      members: agg.rows[0].members,
      packs: packs.rows.map((r) => ({
        rowId: r.row_id,
        jur: r.jur,
        version: r.version,
        status: r.status,
        snapshot: r.snapshot,
      })),
      memberHashes: memberHashes.rows.map((r) => ({ id: r.id, hash: r.hash })),
      counts: state.counts,
      publishedHash: state.publishedRowsHash,
    };
  } finally {
    await c.end();
  }
}

async function packRowByJur(jur: string): Promise<PackRowInfo> {
  const c = await matClient();
  try {
    const r = await c.query(
      `select id as row_id, jurisdiction_code as jur, version, status,
              param_snapshot as snapshot
       from policy_pack_versions where jurisdiction_code = $1`,
      [jur],
    );
    expect(r.rows).toHaveLength(1);
    return {
      rowId: r.rows[0].row_id,
      jur: r.rows[0].jur,
      version: r.rows[0].version,
      status: r.rows[0].status,
      snapshot: r.rows[0].snapshot,
    };
  } finally {
    await c.end();
  }
}

/** 原始物化成员的哈希基线（首次捕获于任何repair之前），用于证明repair不改写原成员。 */
let originalMemberHashes: Array<{ id: number; hash: string }> = [];

/** 回到"4包旧格式漂移"夹具：快照/状态/版本复位，原成员哈希复原。
 * payload缺省为CORRUPT_SNAPSHOT；回滚/并发场景传入各自载荷以区分确定性repair身份。 */
async function resetRepairFixture(
  payload: unknown = CORRUPT_SNAPSHOT,
): Promise<void> {
  const c = await matClient();
  try {
    await c.query(
      `update policy_pack_versions
       set param_snapshot = $1::jsonb, status = 'draft', version = 1
       where jurisdiction_code in ('CN','310000','440000','510000')`,
      [JSON.stringify(payload)],
    );
    if (originalMemberHashes.length > 0) {
      for (const m of originalMemberHashes) {
        await c.query(
          `update policy_import_batch_members set content_hash = $1 where id = $2`,
          [m.hash, m.id],
        );
      }
    }
  } finally {
    await c.end();
  }
}

async function freshRepairAudit(deps: Awaited<ReturnType<typeof repairDeps>>) {
  const audit = await deps.auditMaterialization(deps.manifest, true, repairOpts());
  return audit;
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
    // 先关闭物化器使用的连接池，再显式终止残留会话，最后删库——避免
    // DROP DATABASE ... WITH (FORCE)与未完全收尾的空闲连接竞态产生
    // 57P01/连接中断uncaughtException噪声（WI-20260906-01测试基建修复）。
    const { closeDatabase } = await import("@/lib/db");
    await closeDatabase();
    const admin = await adminClient();
    try {
      await admin.query(
        `select pg_terminate_backend(pid) from pg_stat_activity
         where datname = $1 and pid <> pg_backend_pid()`,
        [MAT_DB],
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      await admin.query(`DROP DATABASE IF EXISTS ${MAT_DB} WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });

  it("AC-011：缺授权/错manifest哈希/错指纹 → 拒绝且持久库零写入", async () => {
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
    const before = await matQuery(
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

    const after = await matQuery(
      `select
         (select count(*)::int from rules) as rules,
         (select count(*)::int from params) as params,
         (select count(*)::int from policy_import_batches) as batches`,
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  // ── WI-20260906-01：draft政策包快照repair加固（测试矩阵） ──────────────────

  it("WI-repair守卫：缺授权/错manifest哈希/错指纹 → 拒绝且政策包、批次、成员零变化", async () => {
    const deps = await repairDeps();
    await resetRepairFixture();
    const audit = await freshRepairAudit(deps);
    expect(audit.packSnapshotDrift).toHaveLength(4);
    const before = await dbSnapshot();
    // 首次捕获原始成员哈希基线（此刻members=74，全部为原物化成员）。
    originalMemberHashes = before.memberHashes;

    await expect(
      deps.repairPackSnapshots(
        deps.manifest,
        {
          authorized: false,
          expectedManifestHash: deps.hash,
          expectedTargetFingerprint: audit.targetFingerprint,
          actor: "test",
        },
        repairOpts(),
      ),
    ).rejects.toMatchObject({ reason: "UNAUTHORIZED" });

    await expect(
      deps.repairPackSnapshots(
        deps.manifest,
        {
          authorized: true,
          expectedManifestHash: "stale-manifest-hash",
          expectedTargetFingerprint: audit.targetFingerprint,
          actor: "test",
        },
        repairOpts(),
      ),
    ).rejects.toMatchObject({ reason: "MANIFEST_MISMATCH" });

    // 旧audit的指纹（此处为任意旧值）不得通过。
    await expect(
      deps.repairPackSnapshots(
        deps.manifest,
        {
          authorized: true,
          expectedManifestHash: deps.hash,
          expectedTargetFingerprint: "stale-target-fingerprint",
          actor: "test",
        },
        repairOpts(),
      ),
    ).rejects.toMatchObject({ reason: "FINGERPRINT_MISMATCH" });

    const after = await dbSnapshot();
    expect(after).toEqual(before);
  });

  it("WI-repair目标绑定：audit后draft快照/状态/版本/成员哈希变化 → 拒绝且不覆盖新值", async () => {
    const deps = await repairDeps();
    await resetRepairFixture();
    const audit = await freshRepairAudit(deps);
    const fp0 = audit.targetFingerprint;
    const guard = {
      authorized: true,
      expectedManifestHash: deps.hash,
      expectedTargetFingerprint: fp0,
      actor: "test",
    };

    // 变体A：audit后修改CN包快照（模拟管理员编辑）。
    await matQuery(
      `update policy_pack_versions
       set param_snapshot = '[{"paramId":"post-audit-edit","value":42}]'::jsonb
       where jurisdiction_code = 'CN'`,
    );
    await expect(
      deps.repairPackSnapshots(deps.manifest, guard, repairOpts()),
    ).rejects.toMatchObject({ reason: "FINGERPRINT_MISMATCH" });
    const cnAfterEdit = await packRowByJur("CN");
    expect(cnAfterEdit.snapshot).toEqual([{ paramId: "post-audit-edit", value: 42 }]);
    await resetRepairFixture();

    // 变体B：audit后修改CN包状态（draft→staging）。
    await matQuery(
      `update policy_pack_versions set status = 'staging' where jurisdiction_code = 'CN'`,
    );
    await expect(
      deps.repairPackSnapshots(deps.manifest, guard, repairOpts()),
    ).rejects.toMatchObject({ reason: "FINGERPRINT_MISMATCH" });
    expect((await packRowByJur("CN")).status).toBe("staging");
    await resetRepairFixture();

    // 变体C：audit后修改GD包版本。
    await matQuery(
      `update policy_pack_versions set version = 7 where jurisdiction_code = '440000'`,
    );
    await expect(
      deps.repairPackSnapshots(deps.manifest, guard, repairOpts()),
    ).rejects.toMatchObject({ reason: "FINGERPRINT_MISMATCH" });
    expect((await packRowByJur("440000")).version).toBe(7);
    await resetRepairFixture();

    // 变体D：audit后修改沪包成员哈希。
    const shPack = await packRowByJur("310000");
    await matQuery(
      `update policy_import_batch_members set content_hash = 'tampered-hash'
       where entity_type = 'policy_pack_version' and entity_row_id = $1`,
      [shPack.rowId],
    );
    await expect(
      deps.repairPackSnapshots(deps.manifest, guard, repairOpts()),
    ).rejects.toMatchObject({ reason: "FINGERPRINT_MISMATCH" });
    const tampered = await matQuery(
      `select content_hash as hash from policy_import_batch_members
       where entity_type = 'policy_pack_version' and entity_row_id = $1`,
      [shPack.rowId],
    );
    expect(tampered.rows[0].hash).toBe("tampered-hash");
    await resetRepairFixture();
  });

  it("WI-repair正常修复：四包全字段一致、repaired批次与新成员落库、原成员不可变、确定性hash、地区语义、零漂移", async () => {
    const deps = await repairDeps();
    await resetRepairFixture();
    const before = await dbSnapshot();
    // 原物化批次的pack成员哈希（repair前基线）。
    const beforePackMembers = await matQuery(
      `select m.business_key, m.content_hash as hash
       from policy_import_batch_members m
       join policy_import_batches b on b.id = m.batch_id
       where b.status = 'applied' and m.entity_type = 'policy_pack_version'`,
    );
    expect(beforePackMembers.rows).toHaveLength(4);
    const audit = await freshRepairAudit(deps);
    expect(audit.packSnapshotDrift).toHaveLength(4);

    const result = await deps.repairPackSnapshots(
      deps.manifest,
      {
        authorized: true,
        expectedManifestHash: deps.hash,
        expectedTargetFingerprint: audit.targetFingerprint,
        actor: "stage-e-test",
      },
      repairOpts(),
    );
    expect(result.noop).toBe(false);
    expect(result.repaired).toHaveLength(4);

    // 四包快照与已提交DSL完全一致（全字段）。
    for (const region of deps.manifest.regions) {
      const row = await packRowByJur(region.jurisdictionCode);
      expect(deps.canonicalJson(row.snapshot)).toBe(
        deps.canonicalJson(deps.buildPackSnapshotPayload(region)),
      );
      expect(row.status).toBe("draft");
    }

    // 批次：4→8，新增批次status=repaired、readiness/阻断原因继承manifest地区语义。
    const after = await dbSnapshot();
    expect(after.batches).toBe(before.batches + 4);
    const allBatches = await matQuery(
      `select id, jurisdiction_code, manifest_hash, target_fingerprint, status,
              readiness, blocking_reasons, entity_counts
       from policy_import_batches order by id`,
    );
    const repairedBatches = allBatches.rows.filter((r) => r.status === "repaired");
    expect(repairedBatches).toHaveLength(4);
    const batchByJur = new Map(
      repairedBatches.map((r) => [r.jurisdiction_code as string, r]),
    );
    for (const region of deps.manifest.regions) {
      const b = batchByJur.get(region.jurisdictionCode)!;
      expect(b.readiness).toBe(region.readiness);
      expect(b.blocking_reasons).toEqual(region.blockingReasons);
      expect(b.target_fingerprint).toBe(audit.targetFingerprint);
      expect(b.entity_counts).toEqual({ packs_repaired: 1 });
    }
    expect(batchByJur.get("440000")!.blocking_reasons).toHaveLength(3);
    expect(batchByJur.get("510000")!.blocking_reasons).toHaveLength(3);

    // 修复hash确定性：由基础manifest哈希+地区+pack+版本+旧/新内容哈希生成。
    const { computeRepairBatchHash } = await import(
      "@/lib/policy-materialization/materialize"
    );
    expect(typeof computeRepairBatchHash).toBe("function");
    expect(new Set(repairedBatches.map((b) => b.manifest_hash)).size).toBe(4);
    for (const b of repairedBatches) {
      expect(b.manifest_hash).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const item of result.repaired) {
      const b = batchByJur.get(item.jurisdictionCode)!;
      expect(b.manifest_hash).toBe(
        computeRepairBatchHash(deps.hash, item),
      );
    }

    // 新成员：每个repair批次恰一条policy_pack_version成员，记录目标行/键/版本/新哈希。
    expect(after.members).toBe(before.members + 4);
    const newMembers = await matQuery(
      `select m.batch_id, m.entity_type, m.entity_row_id, m.business_key, m.version, m.content_hash
       from policy_import_batch_members m
       join policy_import_batches b on b.id = m.batch_id
       where b.status = 'repaired'`,
    );
    expect(newMembers.rows).toHaveLength(4);
    for (const m of newMembers.rows) {
      expect(m.entity_type).toBe("policy_pack_version");
      const item = result.repaired.find((r) => r.packId === m.business_key);
      expect(item).toBeTruthy();
      expect(m.version).toBe(item!.version);
      expect(m.entity_row_id).toBe((await packRowByJur(item!.jurisdictionCode)).rowId);
      expect(m.content_hash).toBe(item!.newContentHash);
    }

    // 原物化成员不可变：全部原成员哈希与操作前一致。
    const originalMap = new Map(before.memberHashes.map((m) => [m.id, m.hash]));
    for (const m of after.memberHashes) {
      if (originalMap.has(m.id)) {
        expect(m.hash).toBe(originalMap.get(m.id));
      }
    }
    // 特别地：原物化批次的pack成员哈希未被改写为newContentHash。
    const afterPackMembers = await matQuery(
      `select m.business_key, m.content_hash as hash
       from policy_import_batch_members m
       join policy_import_batches b on b.id = m.batch_id
       where b.status = 'applied' and m.entity_type = 'policy_pack_version'`,
    );
    expect(afterPackMembers.rows).toHaveLength(4);
    expect(afterPackMembers.rows).toEqual(beforePackMembers.rows);

    // 零漂移：业务计数与published整行哈希不变。
    expect(after.counts).toEqual(before.counts);
    expect(after.counts).toEqual({
      rules: 49,
      params: 70,
      rule_sets: 5,
      policy_pack_versions: 4,
      tests: 528,
      cases: 851,
      showcase_cases: 117,
      policy_snapshots: 0,
    });
    expect(after.publishedHash).toBe(before.publishedHash);
  });

  it("WI-repair事务回滚：注入失败 → 四包、批次和成员全部回到操作前状态", async () => {
    const deps = await repairDeps();
    await resetRepairFixture(CORRUPT_SNAPSHOT_ROLLBACK);
    const before = await dbSnapshot();
    const audit = await freshRepairAudit(deps);

    await expect(
      deps.repairPackSnapshots(
        deps.manifest,
        {
          authorized: true,
          expectedManifestHash: deps.hash,
          expectedTargetFingerprint: audit.targetFingerprint,
          actor: "test",
        },
        repairOpts(),
        // 注入：第2个目标包更新后失败（覆盖"更新+审计写入中途失败"路径）。
        {
          afterPackUpdate: (index: number) => {
            if (index === 1) throw new Error("[repair] 注入的测试失败");
          },
        },
      ),
    ).rejects.toThrow(/注入的测试失败/);

    const after = await dbSnapshot();
    expect(after.batches).toBe(before.batches);
    expect(after.members).toBe(before.members);
    for (const p of after.packs) {
      expect(p.snapshot).toEqual(CORRUPT_SNAPSHOT_ROLLBACK);
      expect(p.status).toBe("draft");
    }
    expect(after.memberHashes).toEqual(before.memberHashes);
    expect(after.publishedHash).toBe(before.publishedHash);
  });

  it("WI-repair并发：同一fresh audit两个repair → 仅一组修复审计，另一复核后no-op", async () => {
    const deps = await repairDeps();
    await resetRepairFixture(CORRUPT_SNAPSHOT_CONCURRENT);
    const before = await dbSnapshot();
    const audit = await freshRepairAudit(deps);
    const guard = {
      authorized: true,
      expectedManifestHash: deps.hash,
      expectedTargetFingerprint: audit.targetFingerprint,
      actor: "test",
    };

    const settled = await Promise.allSettled([
      deps.repairPackSnapshots(deps.manifest, guard, repairOpts()),
      deps.repairPackSnapshots(deps.manifest, guard, repairOpts()),
    ]);
    type RepairResult = Awaited<
      ReturnType<typeof deps.repairPackSnapshots>
    >;
    const fulfilled = settled.flatMap((s) =>
      s.status === "fulfilled" ? [s.value as RepairResult] : [],
    );
    expect(settled.filter((s) => s.status === "rejected")).toHaveLength(0);

    const repairResults = fulfilled.filter((r) => !r.noop);
    const noopResults = fulfilled.filter((r) => r.noop);
    expect(repairResults).toHaveLength(1);
    expect(noopResults).toHaveLength(1);
    expect(repairResults[0]!.repaired).toHaveLength(4);

    // 仅一组修复审计：批次+4、成员+4；四包快照全部一致；零漂移。
    const after = await dbSnapshot();
    expect(after.batches).toBe(before.batches + 4);
    expect(after.members).toBe(before.members + 4);
    for (const region of deps.manifest.regions) {
      const row = await packRowByJur(region.jurisdictionCode);
      expect(deps.canonicalJson(row.snapshot)).toBe(
        deps.canonicalJson(deps.buildPackSnapshotPayload(region)),
      );
    }
    expect(after.counts).toEqual(before.counts);
    expect(after.publishedHash).toBe(before.publishedHash);
  });

  it("WI-repair幂等：成功后fresh audit复跑 → no-op且批次、成员不再增加", async () => {
    const deps = await repairDeps();
    // 承接上一测试：四包已修复且无漂移。
    const audit = await freshRepairAudit(deps);
    expect(audit.packSnapshotDrift).toEqual([]);
    const before = await dbSnapshot();

    const result = await deps.repairPackSnapshots(
      deps.manifest,
      {
        authorized: true,
        expectedManifestHash: deps.hash,
        expectedTargetFingerprint: audit.targetFingerprint,
        actor: "test",
      },
      repairOpts(),
    );
    expect(result.noop).toBe(true);

    const after = await dbSnapshot();
    expect(after).toEqual(before);
  });
});
