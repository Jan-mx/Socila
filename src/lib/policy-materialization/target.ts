/**
 * NRP-NFR-009 / NRP-FR-017 目标保护：
 * - 数据库目标只来自进程级DATABASE_URL，禁止任何dotenv/.env回退；
 * - 阶段E只允许本机 localhost:5432/policyops；
 * - 目标指纹 = 对既有政策行与固定计数的规范化哈希（不含连接串/口令/完整URL）。
 */
import { createHash } from "node:crypto";
import { parse as parsePgConnectionString } from "pg-connection-string";

export interface MaterializationTarget {
  host: string;
  port: string;
  database: string;
}

export class TargetGuardError extends Error {}

/** 解析并校验目标：必须显式设置进程级DATABASE_URL（不得dotenv回退）。
 * 加固（审查缺陷1/NRP-NFR-009）：
 * - 仅接受postgresql/postgres协议；
 * - host仅localhost/127.0.0.1/::1（含方括号IPv6形式），port精确5432，
 *   database精确policyops（或测试显式注入的演练库）；
 * - 拒绝一切search params、fragment、Unix socket与连接目标覆盖参数
 *   （node-postgres连接串解析会让?host=/?port=覆盖authority——已实证）；
 * - 校验结果与node-postgres最终连接配置交叉一致；
 * - 路径不做percent解码（pg不解码，编码路径不得伪装成policyops）；
 * - 异常消息不含连接串与口令。
 * 测试可通过allowedDatabases注入演练库名，生产CLI不传任何放宽参数。 */
export function resolveTarget(
  env: Partial<NodeJS.ProcessEnv> = process.env,
  options: { allowedDatabases?: string[]; allowedPorts?: string[] } = {},
): MaterializationTarget {
  const allowedDatabases = options.allowedDatabases ?? ["policyops"];
  const allowedPorts = options.allowedPorts ?? ["5432"];
  const url = env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new TargetGuardError(
      "[materialize-target] DATABASE_URL 未在进程环境中显式设置（禁止dotenv/.env回退，NRP-FR-017）",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TargetGuardError("[materialize-target] DATABASE_URL 不是合法连接串");
  }

  const protocol = parsed.protocol.replace(/:$/, "");
  if (protocol !== "postgresql" && protocol !== "postgres") {
    throw new TargetGuardError(
      "[materialize-target] 仅允许postgresql/postgres协议（NRP-NFR-009）",
    );
  }
  if (parsed.search.length > 0) {
    throw new TargetGuardError(
      "[materialize-target] 连接串禁止携带查询参数（host/port/dbname等覆盖参数会改变实际连接目标，NRP-NFR-009）",
    );
  }
  if (parsed.hash.length > 0) {
    throw new TargetGuardError(
      "[materialize-target] 连接串禁止携带fragment（NRP-NFR-009）",
    );
  }

  // host：URL.hostname对IPv6带方括号；归一化后仅允许本机回环。
  const rawHost = parsed.hostname;
  const host = rawHost.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0:0:0:0:0:0:0:1"]);
  const isSocketPath = /%2f/i.test(rawHost);
  if (!localHosts.has(host) || isSocketPath) {
    throw new TargetGuardError(
      "[materialize-target] 目标不在授权范围（仅允许本机 localhost:5432/policyops，NRP-NFR-009）",
    );
  }
  const port = parsed.port || "5432";
  if (!allowedPorts.includes(port)) {
    throw new TargetGuardError(
      "[materialize-target] 目标端口不在授权范围（生产固定5432，NRP-NFR-009）",
    );
  }
  // database：路径不做percent解码，必须字面精确。
  const database = parsed.pathname.replace(/^\//, "");
  if (!allowedDatabases.includes(database)) {
    throw new TargetGuardError(
      "[materialize-target] 目标不在授权范围（仅允许本机 localhost:5432/policyops，NRP-NFR-009）",
    );
  }

  // 交叉校验：与node-postgres最终连接配置一致（query覆盖已拒，此处兜底防解析分歧）。
  const pgParsed = parsePgConnectionString(url);
  const pgHost = (pgParsed.host ?? "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .toLowerCase();
  if (
    pgHost !== host ||
    String(pgParsed.port ?? "5432") !== port ||
    pgParsed.database !== database
  ) {
    throw new TargetGuardError(
      "[materialize-target] 连接串解析分歧：URL authority与node-postgres实际连接目标不一致（NRP-NFR-009）",
    );
  }

  return { host, port, database };
}

/** 规范化JSON（键排序）——与快照/黄金对账同一哈希口径。 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 最小SQL接口（便于单测注入假实现）。 */
export interface SqlLike {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** 固定计数核对表（NRP-AC-015 / PRD §9）。 */
export const EXPECTED_TOTAL_COUNTS = {
  rules: 49,
  params: 70,
  rule_sets: 5,
  policy_pack_versions: 4,
  tests: 528,
  cases: 851,
  showcase_cases: 117,
  policy_snapshots: 0,
} as const;

export interface ExistingState {
  counts: Record<string, number>;
  /** published政策行的规范化哈希（旧行保护，NFR-012）。 */
  publishedRowsHash: string;
  /** (jurisdiction, entity_type, business_key) → 最大版本。 */
  maxVersions: Map<string, number>;
  /** 已存在的 pack (jurisdiction, packId) → 最大版本。 */
  packVersions: Map<string, number>;
}

interface CountRow {
  table_name: string;
  n: string;
}

/**
 * 读取既有状态：固定计数、published行规范化哈希、每键最大版本。
 * published行哈希覆盖 rules/params/rule_sets 的全部业务列（旧行保护基线）。
 */
export async function loadExistingState(sql: SqlLike): Promise<ExistingState> {
  const tables = [
    "rules",
    "params",
    "rule_sets",
    "policy_pack_versions",
    "tests",
    "cases",
    "showcase_cases",
    "policy_snapshots",
  ];
  const countRows = await sql.query(
    `select 'rules' as table_name, count(*)::text as n from rules
     union all select 'params', count(*)::text from params
     union all select 'rule_sets', count(*)::text from rule_sets
     union all select 'policy_pack_versions', count(*)::text from policy_pack_versions
     union all select 'tests', count(*)::text from tests
     union all select 'cases', count(*)::text from cases
     union all select 'showcase_cases', count(*)::text from showcase_cases
     union all select 'policy_snapshots', count(*)::text from policy_snapshots`,
  );
  const counts: Record<string, number> = {};
  for (const row of countRows.rows as unknown as CountRow[]) {
    counts[row.table_name] = Number(row.n);
  }

  // 旧行保护哈希（审查缺陷8）：整行规范化对象哈希——to_jsonb在服务器端
  // 确定性序列化（日期/JSONB/UUID等由PG统一渲染），避免维护字段清单遗漏；
  // 统一UTC会话时区保证跨实例一致；只覆盖published行（NFR-012：新draft
  // 不得改变既有published内容）。
  await sql.query("set time zone 'UTC'");
  const publishedRuleRows = await sql.query(
    `select to_jsonb(r) as row from rules r where r.status = 'published' order by r.id`,
  );
  const publishedParamRows = await sql.query(
    `select to_jsonb(p) as row from params p where p.status = 'published' order by p.id`,
  );
  const publishedRuleSetRows = await sql.query(
    `select to_jsonb(rs) as row from rule_sets rs where rs.status = 'published' order by rs.id`,
  );

  const hash = sha256(
    canonicalJson({
      rules: publishedRuleRows.rows.map((r) => r.row),
      params: publishedParamRows.rows.map((r) => r.row),
      rule_sets: publishedRuleSetRows.rows.map((r) => r.row),
    }),
  );

  // 版本解析需要看到全部行（含draft）——幂等重跑不得复用已存在的draft版本号。
  const allRuleRows = await sql.query(
    `select rule_id as business_key, jurisdiction_code, version from rules order by id`,
  );
  const allParamRows = await sql.query(
    `select param_id as business_key, jurisdiction_code, version from params order by id`,
  );
  const allRuleSetRows = await sql.query(
    `select rule_set_id as business_key, jurisdiction_code, version from rule_sets order by id`,
  );

  const maxVersions = new Map<string, number>();
  for (const row of [
    ...allRuleRows.rows,
    ...allParamRows.rows,
    ...allRuleSetRows.rows,
  ]) {
    const key = `${row.jurisdiction_code}|${row.business_key}`;
    const current = maxVersions.get(key) ?? 0;
    maxVersions.set(key, Math.max(current, Number(row.version)));
  }

  const packRows = await sql.query(
    `select jurisdiction_code, policy_pack_id, version from policy_pack_versions`,
  );
  const packVersions = new Map<string, number>();
  for (const row of packRows.rows) {
    const key = `${row.jurisdiction_code}|${row.policy_pack_id}`;
    packVersions.set(key, Math.max(packVersions.get(key) ?? 0, Number(row.version)));
  }

  return { counts, publishedRowsHash: hash, maxVersions, packVersions };
}

/** 目标指纹：主机:端口/库名 + 固定计数 + published行哈希（不含连接串/口令）。 */
export function computeTargetFingerprint(
  target: MaterializationTarget,
  state: ExistingState,
): string {
  return sha256(
    canonicalJson({
      target: `${target.host}:${target.port}/${target.database}`,
      counts: state.counts,
      publishedRowsHash: state.publishedRowsHash,
    }),
  );
}
