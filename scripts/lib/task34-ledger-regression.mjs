/**
 * 任务34第五轮：migration账本回归（WI-20260907-03第四轮复审journal非单调修复）。
 *
 * 在**任务专属隔离数据库**（post dump恢复出的全新PG17+pgvector实例）上验证：
 *   1. 修复后的journal运行migration必须no-op，账本仍为21条（旧journal会让
 *      0014的when=1788991200000 > 账本max=1788796860000而被重新应用→Red）；
 *   2. 仅在隔离库事务中删除账本ID 18、19、20（0012/0013/0014的CRLF重复登记）；
 *   3. 再运行migration两次，均必须no-op；
 *   4. 账本持续为18条，不重新生成0012～0014；
 *   5. ID 10～16、21、22的hash和created_at保持不变；
 *   6. ID 17缺号不补写、不重排主键（id集合恰为1..16、21、22，max=22）；
 *   7. 下一个模拟0019必须使用大于1788796860000的when，并只能应用一次；
 *   8. （EOL契约由migration-lf.contract.test.ts覆盖：core.autocrlf=true
 *      全新checkout下migration SQL仍为LF且hash===Git blob）。
 *
 * 本模块只操作隔离库与临时目录；不连接、不修改持久policyops。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, cpSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/** 0010～0018预期journal时间（与账本created_at一致，严格单调）。 */
export const EXPECTED_TIMES = {
  "0010": 1788560000000, "0011": 1788600000000, "0012": 1788640000000,
  "0013": 1788680000000, "0014": 1788705240000, "0015": 1788777720000,
  "0016": 1788785400000, "0017": 1788796800000, "0018": 1788796860000,
};

/** 模拟0019：必须大于0018（1788796860000）且应用一次后即no-op。 */
export const SIMULATED_0019_WHEN = 1788797000000;
export const SIMULATED_0019_TAG = "0019_ledger_regression_simulated";

export const DUP_IDS = [18, 19, 20];
/** 账本ID → migration前缀（0010～0018的规范行）。 */
export const LEDGER_ID_TO_PREFIX = { 10: "0010", 11: "0011", 12: "0012", 13: "0013", 14: "0014", 15: "0015", 16: "0016", 21: "0017", 22: "0018" };

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function query(url, text) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const r = await client.query(text);
    return r.rows;
  } finally {
    await client.end();
  }
}

async function queryTx(url, text) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(text);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

/**
 * 在隔离库上以指定migrationsFolder运行drizzle migrator。
 * 与scripts/run-migrations.mjs同一migrator实现（drizzle-orm node-postgres
 * migrator）；migrationsFolder参数化以支持模拟0019的临时journal目录。
 */
async function runMigrate({ url, migrationsFolder }) {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

function journalOf(folder) {
  return JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8"));
}

function sqlFilesOf(folder) {
  return readdirSync(folder)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
}

/** journal严格单调（全部entry按idx递增）且0010～0018与预期一致。 */
export function checkJournalMonotonic(journal) {
  const entries = journal.entries;
  const ws = entries.map((e) => Number(e.when));
  const monotonic = ws.every((w, i) => i === 0 || w > ws[i - 1]);
  const byTag = {};
  for (const e of entries) byTag[e.tag.slice(0, 4)] = Number(e.when);
  const timeChecks = [];
  let timeOk = true;
  for (const [prefix, expected] of Object.entries(EXPECTED_TIMES)) {
    const actual = byTag[prefix];
    const ok = actual !== undefined && actual === expected;
    if (!ok) timeOk = false;
    timeChecks.push({ prefix, journalWhen: actual ?? null, expectedWhen: expected, ok });
  }
  const maxWhen = Math.max(...ws);
  return { monotonic, timeOk, timeChecks, maxWhen, entries: entries.length };
}

/**
 * 核心回归：在隔离库url上执行全部8项检查（除EOL契约项，其由
 * migration-lf.contract.test.ts覆盖）。返回结构化证据summary；
 * 任一检查失败直接throw（阻断）。
 */
export async function runLedgerMigrationRegression({ url, workDir, drizzleFolder = "drizzle" }) {
  const folder = resolve(workDir, drizzleFolder);
  const journal = journalOf(folder);
  const journalCheck = checkJournalMonotonic(journal);
  if (!journalCheck.monotonic || !journalCheck.timeOk) {
    throw new Error(`journal非严格单调/与预期时间表不符（阻断）：${JSON.stringify(journalCheck.timeChecks.filter((c) => !c.ok))}`);
  }
  const summary = { url: url.replace(/:[^:@/]+@/, ":***@"), journalCheck };

  // 1) 修复后的journal运行migration必须no-op，账本仍为21条。
  const before = await query(url, `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`);
  await runMigrate({ url, migrationsFolder: folder });
  const afterFirst = await query(url, `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`);
  if (afterFirst.length !== 21) {
    throw new Error(`修复后journal首次migration非no-op：账本${afterFirst.length}条（预期21）`);
  }
  summary.firstRun = { noop: afterFirst.length === before.length && afterFirst.length === 21, ledgerCount: afterFirst.length };

  // 2) 仅在隔离库事务中删除ID 18、19、20。
  await queryTx(url, `DELETE FROM drizzle.__drizzle_migrations WHERE id IN (18, 19, 20)`);
  const afterDelete = await query(url, `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`);
  if (afterDelete.length !== 18) {
    throw new Error(`删除18/19/20后账本${afterDelete.length}条（预期18）`);
  }
  summary.afterDelete = { ledgerCount: afterDelete.length };

  // 3) 再运行migration两次，均必须no-op。
  const runs = [];
  for (let i = 0; i < 2; i++) {
    await runMigrate({ url, migrationsFolder: folder });
    const rows = await query(url, `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`);
    runs.push({ noop: rows.length === 18, ledgerCount: rows.length });
    if (rows.length !== 18) {
      throw new Error(`删除重复行后第${i + 1}次migration非no-op：账本${rows.length}条`);
    }
  }
  summary.migrationNoopAfterDelete = runs;

  // 4) 账本持续18条，不重新生成0012～0014（id集合恰为1..16、21、22）。
  const finalIds = afterDelete.map((r) => r.id);
  const expectedIds = [...Array.from({ length: 16 }, (_, i) => i + 1), 21, 22];
  const idSetOk = JSON.stringify(finalIds) === JSON.stringify(expectedIds);
  if (!idSetOk) {
    throw new Error(`账本id集合为[${finalIds}]（预期1..16、21、22，不补ID 17、不重排）`);
  }
  summary.idSet = { ok: idSetOk, ids: finalIds, missingId17: !finalIds.includes(17), maxId: Math.max(...finalIds) };

  // 5) ID 10～16、21、22的hash和created_at保持不变（对比删除前快照）。
  const kept = [];
  let keptOk = true;
  for (const [id, prefix] of Object.entries(LEDGER_ID_TO_PREFIX)) {
    const b = before.find((r) => r.id === Number(id));
    const a = afterDelete.find((r) => r.id === Number(id));
    const ok = b !== undefined && a !== undefined && a.hash === b.hash && String(a.created_at) === String(b.created_at);
    if (!ok) keptOk = false;
    kept.push({
      id: Number(id), prefix,
      hashBefore: b ? b.hash.slice(0, 16) : null, hashAfter: a ? a.hash.slice(0, 16) : null,
      createdAtBefore: b ? String(b.created_at) : null, createdAtAfter: a ? String(a.created_at) : null,
      ok,
    });
  }
  if (!keptOk) {
    throw new Error(`保留行hash/created_at变化：${JSON.stringify(kept.filter((k) => !k.ok))}`);
  }
  summary.keptUnchanged = { ok: keptOk, rows: kept };

  // 6) ID 17缺号不补写、不重排主键（idSet已断言；这里显式记录）。
  summary.missingId17 = { ok: !finalIds.includes(17), note: "ID 17缺号（重复登记占用id后跳号），不补写、不重排主键" };

  // 7) 模拟0019：临时migrations目录=真实SQL副本+journal追加0019（when>1788796860000）；
  //    必须只应用一次，复跑no-op。
  const tmp = mkdtempSync(join(tmpdir(), "task34-ledger-0019-"));
  try {
    for (const f of sqlFilesOf(folder)) {
      writeFileSync(join(tmp, f), readFileSync(join(folder, f)));
    }
    const metaDir = join(tmp, "meta");
    cpSync(join(folder, "meta"), metaDir, { recursive: true });
    const j = journalOf(tmp);
    j.entries.push({
      idx: j.entries.length,
      version: "7",
      when: SIMULATED_0019_WHEN,
      tag: SIMULATED_0019_TAG,
      breakpoints: true,
    });
    writeFileSync(join(metaDir, "_journal.json"), JSON.stringify(j, null, 2) + "\n");
    const simSql = `-- 任务34第五轮模拟0019（仅验证when>账本max时应用一次，无schema变更）\nSELECT 1;`;
    writeFileSync(join(tmp, `${SIMULATED_0019_TAG}.sql`), simSql);
    const simHash = sha256(Buffer.from(simSql, "utf8"));

    await runMigrate({ url, migrationsFolder: tmp });
    const after0019 = await query(url, `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`);
    if (after0019.length !== 19) {
      throw new Error(`模拟0019应用后账本${after0019.length}条（预期19）`);
    }
    const row0019 = after0019.find((r) => String(r.created_at) === String(SIMULATED_0019_WHEN));
    const appliedOnce = row0019 !== undefined && row0019.hash === simHash;
    if (!appliedOnce) {
      throw new Error(`模拟0019未以预期when/hash登记：${JSON.stringify(row0019)}`);
    }
    await runMigrate({ url, migrationsFolder: tmp });
    const after0019again = await query(url, `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`);
    if (after0019again.length !== 19) {
      throw new Error(`模拟0019复跑非no-op：账本${after0019again.length}条`);
    }
    summary.simulated0019 = {
      when: SIMULATED_0019_WHEN,
      whenGreaterThan0018: SIMULATED_0019_WHEN > 1788796860000,
      appliedOnce,
      secondRunNoop: after0019again.length === 19,
      ledgerCount: after0019again.length,
      row: { hash: row0019.hash.slice(0, 16), created_at: String(row0019.created_at) },
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // 8) EOL契约：当前工作树migration SQL均为LF（hash===Git blob；Windows
  //    core.autocrlf=true下的全新checkout由migration-lf.contract.test.ts覆盖）。
  const eol = [];
  let eolOk = true;
  for (const f of sqlFilesOf(folder)) {
    const buf = readFileSync(join(folder, f));
    const blob = spawnSync("git", ["cat-file", "blob", `HEAD:drizzle/${f}`], { cwd: workDir, maxBuffer: 128 * 1024 * 1024 });
    const blobBuf = blob.status === 0 ? blob.stdout : Buffer.alloc(0);
    const ok = !buf.includes(Buffer.from("\r\n")) && sha256(buf) === sha256(blobBuf);
    if (!ok) eolOk = false;
    eol.push({ file: f, lf: ok });
  }
  if (!eolOk) {
    throw new Error(`工作树migration SQL存在CRLF或hash≠Git blob（EOL契约破坏）`);
  }
  summary.eolContract = { ok: eolOk, files: eol.length, note: "全新checkout的core.autocrlf=true场景由migration-lf.contract.test.ts覆盖" };

  summary.ok = true;
  return summary;
}
