/**
 * NRP-AC-011/013/014/015（阶段E物化落库面，含ADR-0010任务2增量语义）：
 * 在演练容器中创建独立数据库（nrp_e_mat），安装"持久库镜像"——
 * 模拟当前持久库51/74/5/4（SHV2后镜像；原49/70）：旧上海运行基线（24条published规则、29个published
 * 参数、1个published规则集）+ git派生行（CN/沪/川全部内容 + 广东旧内容：
 * 1规则/5参数/旧规则集v1/旧快照包v1）+ 528/851/117案例测试计数，然后验证：
 * - AC-011：缺授权/错manifest哈希/错指纹 → 拒绝且零写入；
 * - AC-013增量（ADR-0010任务2）：fresh audit只规划广东delta
 *   （1规则+5参数+1规则集版本+1政策包版本），CN/沪/川零新增；
 * - AC-015：apply后固定计数52/79/6/5且528/851/117/0不变；GD awaiting_approval、
 *   SC blocked、SC规则0；
 * - AC-014：同manifest重复apply → no-op；计数不符 → 单事务回滚。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
// 第三轮复审：从SOCILA_TEST_DATABASE_URL解析实际端口，不再硬编码5439。
const DRILL_PORT = DRILL_URL ? new URL(DRILL_URL).port || "5432" : "";
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

// ─── ADR-0010任务2：持久库镜像（增量物化夹具） ────────────────────────────────
// 镜像行与materialize.insertEntity的列映射保持一致（字段/缺省逐一对应），
// 保证"内容未变化→零新增"的判定与真实持久库一致。

/** 广东delta之外的新内容判定：与真实持久库（GD旧5参数）比较。 */
function isGdNewParam(p: { param_id?: string; effective_from?: string }): boolean {
  const id = p.param_id;
  if (id === "P-GD-PENSION-CALC-BASE-2025") return true;
  if (id === "P-GD-UNEMPLOYMENT-BENEFIT-RATE") return true;
  if (id === "T-GD-MIN-WAGE-BY-CITY") return true;
  if (
    (id === "P-GD-CONTRIB-BASE-UPPER" ||
      id === "T-GD-CONTRIB-BASE-LOWER-BY-CITY") &&
    p.effective_from === "2025-07-01"
  ) {
    return true;
  }
  return false;
}

/** 计划实体 → 原始SQL插入（镜像insertEntity列映射，供夹具使用）。返回行ID。 */
async function insertEntitySql(
  c: Client,
  e: {
    entityType: string;
    jurisdictionCode: string;
    businessKey: string;
    version: number;
    operation: string;
    targetBusinessKey: string | null;
    payload: Record<string, unknown>;
  },
  regionPackId: string,
): Promise<number> {
  const p = e.payload;
  if (e.entityType === "rule") {
    const r = await c.query(
      `insert into rules (rule_id, jurisdiction_code, business_key, name, module,
         dsl_version, priority, status, effective_from, effective_to, supersedes,
         inputs, parameter_refs, decision_table, outputs, examples, evidence,
         notes, version, operation, target_business_key)
       values ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17,$18,$19,$20) returning id`,
      [
        e.businessKey,
        e.jurisdictionCode,
        e.businessKey,
        (p.name as string) ?? e.businessKey,
        (p.module as string) ?? "",
        (p.dsl_version as string) ?? "SOCILA-DSL-1.0",
        (p.priority as number) ?? 0,
        (p.effective_from as string) ?? "2024-01-01",
        (p.effective_to as string | null) ?? null,
        JSON.stringify((p.supersedes as unknown[]) ?? []),
        JSON.stringify((p.inputs as unknown[]) ?? []),
        JSON.stringify((p.parameter_refs as unknown[]) ?? []),
        JSON.stringify(p.decision_table ?? {}),
        JSON.stringify((p.outputs as unknown[]) ?? []),
        JSON.stringify((p.examples as unknown[]) ?? []),
        JSON.stringify((p.evidence as unknown[]) ?? []),
        (p.notes as string) ?? null,
        e.version,
        e.operation,
        e.targetBusinessKey,
      ],
    );
    return r.rows[0].id as number;
  }
  if (e.entityType === "param") {
    const r = await c.query(
      `insert into params (policy_pack_id, jurisdiction_code, business_key, param_id,
         type, value, unit, effective_from, effective_to, source, key_fields,
         value_fields, rows, note, version, status, operation, target_business_key,
         evidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft',$16,$17,$18)
       returning id`,
      [
        regionPackId,
        e.jurisdictionCode,
        e.businessKey,
        e.businessKey,
        (p.type as string) ?? "number",
        p.value === undefined ? null : JSON.stringify(p.value),
        (p.unit as string | null) ?? null,
        (p.effective_from as string) ?? "2024-01-01",
        (p.effective_to as string | null) ?? null,
        (p.source as string | null) ?? null,
        p.key_fields === undefined ? null : JSON.stringify(p.key_fields),
        p.value_fields === undefined ? null : JSON.stringify(p.value_fields),
        p.rows === undefined ? null : JSON.stringify(p.rows),
        (p.note as string | null) ?? null,
        e.version,
        e.operation,
        e.targetBusinessKey,
        p.evidence === undefined ? null : JSON.stringify(p.evidence),
      ],
    );
    return r.rows[0].id as number;
  }
  if (e.entityType === "rule_set") {
    const r = await c.query(
      `insert into rule_sets (rule_set_id, jurisdiction_code, description, status,
         effective_from, rules, conflict_resolution, version, operation,
         target_business_key)
       values ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9) returning id`,
      [
        e.businessKey,
        e.jurisdictionCode,
        (p.description as string | null) ?? null,
        (p.effective_from as string) ?? "2024-01-01",
        JSON.stringify((p.rules as string[]) ?? []),
        p.conflict_resolution === undefined
          ? null
          : JSON.stringify(p.conflict_resolution),
        e.version,
        e.operation,
        e.targetBusinessKey,
      ],
    );
    return r.rows[0].id as number;
  }
  // policy_pack_version：payload即paramSnapshot。
  const r = await c.query(
    `insert into policy_pack_versions (policy_pack_id, jurisdiction_code, pack_kind,
       version, param_snapshot, status, effective_from)
     values ($1,$2,$3,$4,$5,'draft','2024-01-01') returning id`,
    [
      e.businessKey,
      e.jurisdictionCode,
      e.jurisdictionCode === "CN" ? "baseline" : "overlay",
      e.version,
      JSON.stringify(e.payload),
    ],
  );
  return r.rows[0].id as number;
}

/** 安装持久库镜像：legacy沪基线 + git派生行（CN/沪/川全部 + 广东旧内容）。
 * 返回镜像计数（51/74/5/4）。 */
async function seedPersistentMirror(c: Client): Promise<void> {
  // 1) 旧上海运行基线（published）。
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

  // 2) git派生行：CN/沪/川全部内容（沪按已有v1基线→v2），广东只留旧内容。
  const { buildManifest, entityContentHash } = await import(
    "@/lib/policy-materialization/manifest"
  );
  const {
    buildPlan,
    buildPackSnapshotPayload,
  } = await import("@/lib/policy-materialization/plan");
  const manifest = buildManifest({
    showHead: (pth) =>
      pth === "COMMIT"
        ? "mat-test-commit"
        : readFileSync(path.join(process.cwd(), pth), "utf8"),
    listCommittedFiles: () => [],
    isWorktreeDirty: () => false,
  });
  const fullPlan = buildPlan(manifest, {
    counts: {
      rules: 24,
      params: 29,
      rule_sets: 1,
      policy_pack_versions: 0,
      tests: 528,
      cases: 851,
      showcase_cases: 117,
      policy_snapshots: 0,
    },
    publishedRowsHash: "seed",
    maxVersions: new Map(),
    packVersions: new Map(),
    packTargets: [],
    existingEntityHashes: new Map(),
  }, []);

  const gdRegion = manifest.regions.find(
    (r) => r.jurisdictionCode === "440000",
  )!;
  const oldGdRegion = {
    ...gdRegion,
    rules: gdRegion.rules.filter(
      (r) => r.businessKey === "R-GD-MI-RETIRE-RESTRICT",
    ),
    params: gdRegion.params.filter((p) => !isGdNewParam(p.payload)),
  };

  // 每地区批量审计成员（镜像持久库80成员：CN24+沪43+粤8+川5；SHV2后沪=10规则+31参数+1规则集+1包）。
  const membersByJur = new Map<string, Array<Record<string, unknown>>>();
  for (const region of fullPlan.regions) {
    const isGd = region.jurisdictionCode === "440000";
    const members: Array<Record<string, unknown>> = [];
    const packId =
      region.jurisdictionCode === "440000"
        ? "GD-BASE"
        : region.jurisdictionCode === "310000"
          ? "SHANGHAI_BASE"
          : region.jurisdictionCode === "CN"
            ? "CN-BASELINE"
            : "SC-BASE";
    for (const e of region.entities) {
      let entity = e;
      if (isGd) {
        if (e.entityType === "rule" && e.businessKey === "R-GD-UI-AMOUNT") continue;
        if (e.entityType === "param" && isGdNewParam(e.payload as { param_id?: string; effective_from?: string })) continue;
        if (e.entityType === "rule_set") {
          entity = {
            ...e,
            version: 1,
            payload: {
              ...(e.payload as Record<string, unknown>),
              rules: ((e.payload as { rules?: string[] }).rules ?? []).filter(
                (r) => r !== "R-GD-UI-AMOUNT",
              ),
            } as Record<string, unknown>,
          };
        } else if (e.entityType === "policy_pack_version") {
          entity = {
            ...e,
            version: 1,
            payload: buildPackSnapshotPayload(
              oldGdRegion,
            ) as unknown as Record<string, unknown>,
          };
        }
      }
      const rowId = await insertEntitySql(
        c,
        {
          ...entity,
          payload: entity.payload as Record<string, unknown>,
          version:
            region.jurisdictionCode === "310000" &&
            entity.entityType !== "policy_pack_version"
              ? entity.version + 1
              : entity.version,
        },
        packId,
      );
      members.push({
        entity_type: entity.entityType,
        entity_row_id: rowId,
        business_key: entity.businessKey,
        version:
          region.jurisdictionCode === "310000" &&
          entity.entityType !== "policy_pack_version"
            ? entity.version + 1
            : entity.version,
        content_hash: entityContentHash(
          entity.entityType as "rule" | "param" | "rule_set" | "policy_pack_version",
          entity.jurisdictionCode,
          entity.businessKey,
          region.jurisdictionCode === "310000" &&
            entity.entityType !== "policy_pack_version"
            ? entity.version + 1
            : entity.version,
          entity.payload as Record<string, unknown>,
        ),
      });
    }
    membersByJur.set(region.jurisdictionCode, members);
  }

  // 3) 批次审计镜像（每地区1条applied批次 + 成员，manifest哈希为seed占位）。
  for (const [jur, members] of membersByJur) {
    const readiness = jur === "510000" ? "blocked" : "awaiting_approval";
    const blockingReasons =
      jur === "510000"
        ? [
            "医保退休年限省级统一文件未正式印发（仅2025-03征求意见稿，不作为事实源）",
            "失业保险金标准原文（川人社办发〔2023〕18号）未在白名单域名获取",
            "2026年度缴费基数未公布，2025年度参数窗口已失效",
          ]
        : [];
    const batch = await c.query(
      `insert into policy_import_batches
         (jurisdiction_code, manifest_hash, source_commit, target_fingerprint,
          status, readiness, blocking_reasons, entity_counts, actor)
       values ($1,'seed-mirror-hash','seed', 'seed-fp', 'applied', $2, $3::jsonb,
               $4::jsonb, 'seed')
       returning id`,
      [
        jur,
        readiness,
        JSON.stringify(blockingReasons),
        JSON.stringify({ seeded: true }),
      ],
    );
    for (const m of members) {
      await c.query(
        `insert into policy_import_batch_members
           (batch_id, entity_type, entity_row_id, business_key, version, content_hash)
         values ($1,$2,$3,$4,$5,$6)`,
        [
          batch.rows[0].id,
          m.entity_type,
          m.entity_row_id,
          m.business_key,
          m.version,
          m.content_hash,
        ],
      );
    }
  }

  // 3) 案例与测试计数基线（528/851/117）。
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
       (select count(*)::int from rules) as rules,
       (select count(*)::int from params) as params,
       (select count(*)::int from rule_sets) as rule_sets,
       (select count(*)::int from policy_pack_versions) as packs,
       (select count(*)::int from tests) as tests,
       (select count(*)::int from cases) as cases,
       (select count(*)::int from showcase_cases) as showcase,
       (select count(*)::int from policy_snapshots) as snapshots`,
  );
  expect(counts.rows[0]).toEqual({
    rules: 51,
    params: 74,
    rule_sets: 5,
    packs: 4,
    tests: 528,
    cases: 851,
    showcase: 117,
    snapshots: 0,
  });
}

// ─── WI-20260906-01 repair集成测试基础设施 ────────────────────────────────────

/** 模拟持久库现状：4个draft政策包保存旧版不完整快照（漂移）。
 * 每个repair场景使用不同损坏载荷：确定性repair批次哈希由"旧内容哈希"参与生成，
 * 同一损坏内容重复修复会命中0014唯一约束（规格行为=报错），夹具必须可区分。 */
const CORRUPT_SNAPSHOT = [{ paramId: "legacy-incomplete", value: 1 }];
const CORRUPT_SNAPSHOT_ROLLBACK = [{ paramId: "legacy-incomplete-rollback", value: 2 }];
const CORRUPT_SNAPSHOT_CONCURRENT = [{ paramId: "legacy-incomplete-concurrent", value: 3 }];

function repairOpts(): { allowedDatabases: string[]; allowedPorts: string[] } {
  return { allowedDatabases: [MAT_DB], allowedPorts: [DRILL_PORT] };
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
 * 先复位全部包行为v1，再按地区只保留最小行ID（增量产生的GD v2与目标绑定
 * 测试的版本篡改行一并收敛），保证每地区恰1个draft包行。
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
    await c.query(
      `delete from policy_pack_versions p
       where jurisdiction_code in ('CN','310000','440000','510000')
         and p.id not in (
           select min(p2.id) from policy_pack_versions p2
           where p2.jurisdiction_code in ('CN','310000','440000','510000')
           group by p2.jurisdiction_code
         )`,
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

  // 安装"持久库镜像"（51/74/5/4：旧沪基线 + git派生行 + 广东旧内容）。
  const c = await matClient();
  try {
    await seedPersistentMirror(c);

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
      allowedPorts: [DRILL_PORT],
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
        { allowedDatabases: [MAT_DB], allowedPorts: [DRILL_PORT] },
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
        { allowedDatabases: [MAT_DB], allowedPorts: [DRILL_PORT] },
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
        { allowedDatabases: [MAT_DB], allowedPorts: [DRILL_PORT] },
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

  it("AC-013/015（增量，ADR-0010任务2）：audit只规划广东delta；apply后52/79/6/5；CN/沪/川零新增；复跑no-op", async () => {
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

    // ── fresh audit：只显示GD delta（复现修复：不再重放四地区整包74/116/9/8）。
    const audit = await auditMaterialization(manifest, true, {
      allowedDatabases: [MAT_DB],
      allowedPorts: [DRILL_PORT],
    });
    expect(audit.plan.counts).toEqual({
      rules: 1,
      params: 5,
      ruleSets: 1,
      packs: 1,
    });
    const planByJur = new Map(
      audit.plan.regions.map((r) => [r.jurisdictionCode, r]),
    );
    for (const jur of ["CN", "310000", "510000"]) {
      expect(planByJur.get(jur)!.counts).toEqual({
        rules: 0,
        params: 0,
        ruleSets: 0,
        packs: 0,
      });
    }
    expect(planByJur.get("440000")!.counts).toEqual({
      rules: 1,
      params: 5,
      ruleSets: 1,
      packs: 1,
    });
    // 包快照漂移只含GD（CN/沪/川快照与git一致）。
    expect(audit.packSnapshotDrift).toHaveLength(1);
    expect(audit.packSnapshotDrift[0]!.jurisdictionCode).toBe("440000");
    // 目标计数 = 当前状态 + delta（51/74/5/4 → 52/79/6/5；SHV2后上海10规则/31参数已在镜像中）。
    expect(audit.expectedPostCounts).toEqual({
      rules: 52,
      params: 79,
      rule_sets: 6,
      policy_pack_versions: 5,
      tests: 528,
      cases: 851,
      showcase_cases: 117,
      policy_snapshots: 0,
    });

    // ── apply：单事务写入GD delta，其余地区零实体批次。
    const result = await applyMaterialization(
      {
        authorized: true,
        expectedManifestHash: hash,
        expectedTargetFingerprint: audit.targetFingerprint,
        manifest,
        worktreeClean: true,
        actor: "stage-e-test",
        // SHV2（WI-20260911-01）：镜像已含当前上海资产（51/74），本场景目标=镜像+GD delta。
        expectedTotalCounts: {
          rules: 52,
          params: 79,
          rule_sets: 6,
          policy_pack_versions: 5,
          tests: 528,
          cases: 851,
          showcase_cases: 117,
          policy_snapshots: 0,
        },
      },
      { allowedDatabases: [MAT_DB], allowedPorts: [DRILL_PORT] },
    );
    expect(result.noop).toBe(false);
    expect(result.publishedRowsHashBefore).toBe(oldRowsHashBefore);
    expect(result.publishedRowsHashAfter).toBe(oldRowsHashBefore);

    // 固定计数（NRP-AC-015）：候选快照前目标52/79/6/5（SHV2镜像基线51/74）。
    expect(result.counts).toEqual({
      rules: 52,
      params: 79,
      rule_sets: 6,
      policy_pack_versions: 5,
      tests: 528,
      cases: 851,
      showcase_cases: 117,
      policy_snapshots: 0,
    });

    const c = await matClient();
    try {
      // 批次就绪语义（NRP-FR-022）：GD由blocked转为awaiting_approval；
      // 四川三项阻断原因不变。
      const batches = await c.query(
        `select jurisdiction_code, readiness, blocking_reasons, entity_counts
         from policy_import_batches
         where manifest_hash = $1 order by id`,
        [hash],
      );
      expect(batches.rows).toHaveLength(4);
      const byJur = new Map(
        batches.rows.map((r) => [r.jurisdiction_code as string, r]),
      );
      expect(byJur.get("CN")!.readiness).toBe("awaiting_approval");
      expect(byJur.get("310000")!.readiness).toBe("awaiting_approval");
      expect(byJur.get("440000")!.readiness).toBe("awaiting_approval");
      expect(byJur.get("510000")!.readiness).toBe("blocked");
      expect(byJur.get("440000")!.blocking_reasons as string[]).toHaveLength(0);
      expect(
        (byJur.get("510000")!.entity_counts as { rules: number }).rules,
      ).toBe(0);
      expect(
        byJur.get("510000")!.blocking_reasons as string[],
      ).toHaveLength(3);
      // 只有GD批次携带实体（8成员：1规则+5参数+1规则集+1包）。
      expect(byJur.get("440000")!.entity_counts).toEqual({
        rules: 1,
        params: 5,
        ruleSets: 1,
        packs: 1,
      });
      for (const jur of ["CN", "310000", "510000"]) {
        expect(byJur.get(jur)!.entity_counts).toEqual({
          rules: 0,
          params: 0,
          ruleSets: 0,
          packs: 0,
        });
      }

      // 未变化的CN、上海、四川零新增；广东只增加delta（1规则+5参数+1规则集）。
      const afterCounts = (await matQuery(
        `select jurisdiction_code,
           (select count(*)::int from rules r where r.jurisdiction_code=p.jurisdiction_code) as rules,
           (select count(*)::int from params p2 where p2.jurisdiction_code=p.jurisdiction_code) as params,
           (select count(*)::int from rule_sets rs where rs.jurisdiction_code=p.jurisdiction_code) as rule_sets
         from (values ('CN'),('310000'),('440000'),('510000')) p(jurisdiction_code)
         order by jurisdiction_code`,
      )).rows;
      expect(afterCounts).toEqual([
        { jurisdiction_code: "310000", rules: 34, params: 60, rule_sets: 2 },
        { jurisdiction_code: "440000", rules: 2, params: 10, rule_sets: 2 },
        { jurisdiction_code: "510000", rules: 0, params: 3, rule_sets: 1 },
        { jurisdiction_code: "CN", rules: 16, params: 6, rule_sets: 1 },
      ]);

      // 广东增量版本语义：旧窗口保持v1、新窗口v2；三个全新参数v1；
      // 新规则v1；规则集下一版本v2；政策包v2。
      const gdVersions = await c.query(
        `select business_key, version, status from (
           select rule_id as business_key, version, status from rules
           union all select param_id, version, status from params
           union all select rule_set_id, version, status from rule_sets
         ) v where (business_key, version) in
           (('R-GD-MI-RETIRE-RESTRICT',1), ('R-GD-UI-AMOUNT',1),
            ('P-GD-CONTRIB-BASE-UPPER',1), ('P-GD-CONTRIB-BASE-UPPER',2),
            ('T-GD-CONTRIB-BASE-LOWER-BY-CITY',1),
            ('T-GD-CONTRIB-BASE-LOWER-BY-CITY',2),
            ('P-GD-PENSION-CALC-BASE-2025',1),
            ('P-GD-UNEMPLOYMENT-BENEFIT-RATE',1),
            ('T-GD-MIN-WAGE-BY-CITY',1),
            ('RS-GD-PLAN-V1',1), ('RS-GD-PLAN-V1',2))
         order by business_key, version`,
      );
      const gdVMap = new Map(
        gdVersions.rows.map(
          (r) => [`${r.business_key}|${r.version}`, r.status] as const,
        ),
      );
      expect(gdVMap.get("R-GD-MI-RETIRE-RESTRICT|1")).toBe("draft");
      expect(gdVMap.get("R-GD-UI-AMOUNT|1")).toBe("draft");
      expect(gdVMap.get("P-GD-CONTRIB-BASE-UPPER|1")).toBe("draft");
      expect(gdVMap.get("P-GD-CONTRIB-BASE-UPPER|2")).toBe("draft");
      expect(gdVMap.get("T-GD-CONTRIB-BASE-LOWER-BY-CITY|1")).toBe("draft");
      expect(gdVMap.get("T-GD-CONTRIB-BASE-LOWER-BY-CITY|2")).toBe("draft");
      expect(gdVMap.get("P-GD-PENSION-CALC-BASE-2025|1")).toBe("draft");
      expect(gdVMap.get("P-GD-UNEMPLOYMENT-BENEFIT-RATE|1")).toBe("draft");
      expect(gdVMap.get("T-GD-MIN-WAGE-BY-CITY|1")).toBe("draft");
      expect(gdVMap.get("RS-GD-PLAN-V1|1")).toBe("draft");
      expect(gdVMap.get("RS-GD-PLAN-V1|2")).toBe("draft");
      const gdPacks = await c.query(
        `select version, status from policy_pack_versions
         where jurisdiction_code='440000' order by version`,
      );
      expect(gdPacks.rows).toHaveLength(2);
      expect(gdPacks.rows[0]).toEqual({ version: 1, status: "draft" });
      expect(gdPacks.rows[1]).toEqual({ version: 2, status: "draft" });
      // GD规则集v2包含新规则、v1不含（旧内容不可变）。
      const gdRs = await c.query(
        `select version, rules from rule_sets
         where jurisdiction_code='440000' order by version`,
      );
      expect((gdRs.rows[0]!.rules as string[])).not.toContain("R-GD-UI-AMOUNT");
      expect((gdRs.rows[1]!.rules as string[])).toContain("R-GD-UI-AMOUNT");

      // 批次成员审计（仅本次apply批次）：GD 8成员；CN/沪/川批次0成员。
      const memberCounts = await c.query(
        `select b.jurisdiction_code, count(m.id)::int as n
         from policy_import_batches b left join policy_import_batch_members m
           on m.batch_id = b.id
         where b.manifest_hash = $1
         group by b.jurisdiction_code order by b.jurisdiction_code`,
        [hash],
      );
      expect(memberCounts.rows).toEqual([
        { jurisdiction_code: "310000", n: 0 },
        { jurisdiction_code: "440000", n: 8 },
        { jurisdiction_code: "510000", n: 0 },
        { jurisdiction_code: "CN", n: 0 },
      ]);

      // 新draft不改变published计数（旧行保护，NFR-012）。
      const published = await c.query(
        `select
           (select count(*)::int from rules where status='published') as rules,
           (select count(*)::int from params where status='published') as params`,
      );
      expect(published.rows[0]).toEqual({ rules: 24, params: 29 });
    } finally {
      await c.end();
    }

    // ── 复跑no-op（AC-014）：相同delta只产生一组结果。
    const noop = await applyMaterialization(
      {
        authorized: true,
        expectedManifestHash: hash,
        expectedTargetFingerprint: (
          await auditMaterialization(manifest, true, {
            allowedDatabases: [MAT_DB],
            allowedPorts: [DRILL_PORT],
          })
        ).targetFingerprint,
        manifest,
        worktreeClean: true,
        actor: "stage-e-test",
      },
      { allowedDatabases: [MAT_DB], allowedPorts: [DRILL_PORT] },
    );
    expect(noop.noop).toBe(true);
    const afterNoop = await matQuery(
      `select
         (select count(*)::int from rules) as rules,
         (select count(*)::int from params) as params,
         (select count(*)::int from policy_import_batches) as batches,
         (select count(*)::int from policy_import_batch_members) as members`,
    );
    expect(afterNoop.rows[0]).toEqual({ rules: 52, params: 79, batches: 8, members: 88 });
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
          ).auditMaterialization(manifest, true, { allowedDatabases: [MAT_DB], allowedPorts: [DRILL_PORT] })
        ).targetFingerprint,
        manifest,
        worktreeClean: true,
        actor: "stage-e-test",
      },
      { allowedDatabases: [MAT_DB], allowedPorts: [DRILL_PORT] },
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
      ).auditMaterialization(manifest, true, { allowedDatabases: [MAT_DB], allowedPorts: [DRILL_PORT] })
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
        { allowedDatabases: [MAT_DB], allowedPorts: [DRILL_PORT] },
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
    // 原物化批次的pack成员哈希（repair前基线：仅seed镜像批次，不含本次apply）。
    const beforePackMembers = await matQuery(
      `select m.business_key, m.content_hash as hash
       from policy_import_batch_members m
       join policy_import_batches b on b.id = m.batch_id
       where b.manifest_hash = 'seed-mirror-hash' and m.entity_type = 'policy_pack_version'`,
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
    expect(batchByJur.get("440000")!.blocking_reasons).toHaveLength(0);
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
       where b.manifest_hash = 'seed-mirror-hash' and m.entity_type = 'policy_pack_version'`,
    );
    expect(afterPackMembers.rows).toHaveLength(4);
    expect(afterPackMembers.rows).toEqual(beforePackMembers.rows);

    // 零漂移：业务计数与published整行哈希不变（repair只修快照不增业务行；
    // 夹具复位后GD v2行已收敛，故packs=4是修复时点的事实状态）。
    expect(after.counts).toEqual(before.counts);
    expect(after.counts).toEqual({
      rules: 52,
      params: 79,
      rule_sets: 6,
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

  it("就绪语义：blocked判定以最新批次为准（历史blocked批次不阻塞当前awaiting_approval，ADR-0010批准前提）", async () => {
    const { isJurisdictionBlocked } = await import(
      "@/lib/policy-materialization/materialize"
    );
    // 当前fixture：GD最新批次（本次apply id 10）为awaiting_approval，
    // 但seed镜像的GD历史批次为blocked（3条旧原因）——模拟持久库GD曾blocked。
    await matQuery(
      `update policy_import_batches set readiness = 'blocked',
              blocking_reasons = '["历史阻断原因1","历史阻断原因2","历史阻断原因3"]'::jsonb
       where jurisdiction_code = '440000' and manifest_hash = 'seed-mirror-hash'`,
    );
    // 四川最新批次blocked → 必须仍判定blocked（WI-20260907-01不放松）。
    expect(await isJurisdictionBlocked("440000")).toBe(false);
    expect(await isJurisdictionBlocked("510000")).toBe(true);
    expect(await isJurisdictionBlocked("CN")).toBe(false);
  });
});
