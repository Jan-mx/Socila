/**
 * WI-20260907-04 repair-forward执行器（任务34，可审计/确定性/单事务/幂等）。
 *
 * 用法（DATABASE_URL必须显式给出，不读取dotenv回退）：
 *   node scripts/rcl-repair-forward-task34.mjs audit
 *   node scripts/rcl-repair-forward-task34.mjs plan [--out <executable-write-set.json>]
 *   node scripts/rcl-repair-forward-task34.mjs apply --i-am-authorized --plan-hash <hash> --target-fingerprint <fingerprint>
 *   node scripts/rcl-repair-forward-task34.mjs verify [--plan <executable-write-set.json>]
 *
 * - 无参数或未知模式直接失败（退出2），禁止任何默认写入；audit/plan/verify只读。
 * - apply缺 --i-am-authorized / --plan-hash / --target-fingerprint 任一即拒绝（零写入）。
 * - 绑定：codeSha=当前HEAD（工作树有未提交改动时apply拒绝，除非隔离演练显式
 *   RCL_REPAIR_ALLOW_DIRTY=1）；trustedArchiveManifestHash da0ea94d…、
 *   trustedArchiveDumpSha 0e3c3d8b…、trustedArchiveDir永久可信归档目录；fresh
 *   attestationManifestHash / migrationLedgerFingerprint / targetFingerprint。
 * - 可信归档批次ID确定性派生：sha256("task34-r4-trusted-archive:<manifestHash>")
 *   → c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141（禁止运行时随机UUID）。
 * - 单事务：账本删除（完整旧值条件、RETURNING恰好18/19/20）、prepared批次
 *   91d60c5f→rolled_back（RETURNING恰好1行）、新增restore_verified可信批次与988条
 *   真实entries在同一REPEATABLE READ事务；事务开始即pg_advisory_xact_lock；事务内
 *   重算targetFingerprint、FOR UPDATE锁定并核对账本行与prepared批次、核对
 *   attestation与可信归档；任一不一致立即回滚。
 * - 幂等：全部已完成→noop:true；部分完成/不一致→REPAIR_STATE_DRIFT（禁止补写）。
 * - 防误写：目标库名为policyops时apply拒绝，除非显式RCL_REPAIR_ALLOW_PERSISTENT=1
 *   （本任务不授权持久写入；该变量仅供未来用户授权的repair执行使用）。
 *
 * 实现：核心逻辑在 src/lib/case-repair/repair-forward.ts（vitest单元覆盖）；
 * 本入口在未处于tsx运行时时以tsx CLI重新加载自身（同一进程执行全部数据库操作）。
 *
 * 退出码：0成功/noop；2用法/授权/防误写拒绝；3 PLAN_HASH_MISMATCH；
 * 4 TARGET_FINGERPRINT_MISMATCH；5 REPAIR_STATE_DRIFT/POST_STATE_MISMATCH；
 * 6 可信归档/前置条件不符；7 注入故障（演练）；1 其他错误。
 */
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");

if (!process.env.RCL_REPAIR_UNDER_TSX) {
  const tsxCli = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const r = spawnSync(process.execPath, [tsxCli, SELF, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, RCL_REPAIR_UNDER_TSX: "1" },
  });
  process.exit(r.status ?? 1);
}

const core = await import("../src/lib/case-repair/repair-forward.ts");
const pg = (await import("pg")).default;

const EXIT_BY_CODE = {
  USAGE: 2, AUTHORIZATION_REQUIRED: 2, PLAN_HASH_REQUIRED: 2, TARGET_FINGERPRINT_REQUIRED: 2,
  PERSISTENT_TARGET_REFUSED: 2, DIRTY_WORKTREE: 2, DATABASE_URL_REQUIRED: 2,
  PLAN_HASH_MISMATCH: 3,
  TARGET_FINGERPRINT_MISMATCH: 4,
  REPAIR_STATE_DRIFT: 5, POST_STATE_MISMATCH: 5,
  TRUSTED_ARCHIVE_MISMATCH: 6, ENTRY_HASH_INVALID: 6, ENTRY_DUPLICATE: 6, ENTRY_ID_INVALID: 6,
  LEDGER_PRECONDITION_MISMATCH: 6, PREPARED_BATCH_PRECONDITION_MISMATCH: 6, LEDGER_DELETE_MISMATCH: 6,
  PREPARED_BATCH_UPDATE_MISMATCH: 6, TRUSTED_BATCH_INSERT_MISMATCH: 6, ENTRIES_INSERT_MISMATCH: 6,
  FAULT_INJECTED: 7,
};

function emit(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function fail(err) {
  const code = err?.code ?? "ERROR";
  emit({ ok: false, error: code, message: err?.message ?? String(err), details: err?.details ?? null });
  process.exit(EXIT_BY_CODE[code] ?? 1);
}

function gitHead() {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
  return { sha, dirty };
}

function databaseName(url) {
  try {
    return { host: new URL(url).hostname, port: new URL(url).port || "5432", db: new URL(url).pathname.replace(/^\//, "") };
  } catch {
    return { host: "", port: "", db: "" };
  }
}

async function main() {
  let args;
  try {
    args = core.parseRepairArgs(process.argv.slice(2));
  } catch (err) {
    fail(err);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail(new core.RepairForwardError("DATABASE_URL_REQUIRED", "必须显式设置 DATABASE_URL（不读取dotenv回退）"));
    return;
  }
  const { sha: codeSha, dirty } = gitHead();
  const target = databaseName(url);
  const trustedDir = args.trustedDir ?? undefined;

  if (args.mode === "apply") {
    if (target.db === "policyops" && process.env.RCL_REPAIR_ALLOW_PERSISTENT !== "1") {
      fail(new core.RepairForwardError("PERSISTENT_TARGET_REFUSED", `目标库 ${target.host}:${target.port}/${target.db} 为持久库；本执行器默认拒绝写入持久库（需用户授权后显式 RCL_REPAIR_ALLOW_PERSISTENT=1）`));
      return;
    }
    if (dirty && process.env.RCL_REPAIR_ALLOW_DIRTY !== "1") {
      fail(new core.RepairForwardError("DIRTY_WORKTREE", `工作树存在未提交改动，codeSha ${codeSha} 不能代表运行代码；apply拒绝（隔离演练可显式 RCL_REPAIR_ALLOW_DIRTY=1）`));
      return;
    }
  }

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    if (args.mode === "audit") {
      const result = await core.runAudit(client, { codeSha, trustedDir });
      emit({ ok: true, ...result, worktreeDirty: dirty, target });
      return;
    }
    if (args.mode === "plan") {
      await core.setDeterministicSession(client);
      const { plan, live } = await core.buildPlanFromLive(client, { codeSha, trustedDir });
      const state = core.classifyRepairState(live, plan);
      const summary = {
        ok: true, mode: "plan", codeSha, worktreeDirty: dirty, target, state,
        planHash: plan.planHash, targetFingerprint: plan.targetFingerprint, attestationManifestHash: plan.attestationManifestHash,
        migrationLedgerFingerprint: plan.migrationLedgerFingerprint, trustedBatchId: plan.trustedBatch.id,
        entries: plan.entries.length, ledgerDelete: plan.ledgerDelete.map((r) => r.id), ledgerKeep: plan.ledgerKeep.length,
        preparedBatch: plan.preparedBatch, trustedArchive: plan.trustedArchive, counts: plan.counts,
        out: args.out ?? null,
      };
      if (args.out) {
        writeFileSync(args.out, JSON.stringify(plan, null, 2));
      } else {
        summary.plan = plan;
      }
      emit(summary);
      return;
    }
    if (args.mode === "verify") {
      const planPath = (() => { const i = process.argv.indexOf("--plan"); return i >= 0 ? process.argv[i + 1] : null; })();
      const expectedPlan = planPath ? JSON.parse(readFileSync(planPath, "utf8")) : null;
      const result = await core.runVerify(client, { codeSha, trustedDir, expectedPlan });
      emit({ ok: result.ok, ...result, worktreeDirty: dirty, target, expectedPlanHash: expectedPlan?.planHash ?? null });
      process.exitCode = result.ok ? 0 : 5;
      return;
    }
    // apply
    const fault = process.env.RCL_REPAIR_FAULT && core.FAULT_POINTS.includes(process.env.RCL_REPAIR_FAULT) ? process.env.RCL_REPAIR_FAULT : null;
    const result = await core.runApply(client, {
      codeSha, planHash: args.planHash, targetFingerprint: args.targetFingerprint, trustedDir, fault,
    });
    emit({ ok: true, ...result, worktreeDirty: dirty, target });
  } catch (err) {
    fail(err);
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
