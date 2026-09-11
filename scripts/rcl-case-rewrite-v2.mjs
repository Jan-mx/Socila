/**
 * WI-20260911-03 受控原位改写CLI（SHV2-FR-019～023、AC-015～018）：
 *
 *   node scripts/rcl-case-rewrite-v2.ts audit  --generated <generated-scenarios-v2.json>
 *   node scripts/rcl-case-rewrite-v2.ts plan   --generated <gen.json> [--out <dir>] [--actor <id>]
 *   node scripts/rcl-case-rewrite-v2.ts apply  --generated <gen.json> --plan-file <rewrite-plan-v2.json>
 *         --i-am-authorized --plan-hash <hash> --target-fingerprint <fp> [--actor <id>]
 *   node scripts/rcl-case-rewrite-v2.ts verify --generated <gen.json> --plan-file <rewrite-plan-v2.json>
 *
 * - DATABASE_URL必须进程显式设置（禁止dotenv回退）；目标库名为`policyops`时apply默认
 *   拒绝（需显式RCL_REWRITE_ALLOW_PERSISTENT=1，仅供未来用户授权的持久执行）；
 * - apply前置：--i-am-authorized、精确--plan-hash与--target-fingerprint、工作树干净且
 *   HEAD==plan.codeSha（隔离演练可显式RCL_REWRITE_ALLOW_DIRTY=1，持久执行不得设置）；
 * - 单事务：REPEATABLE READ+任务专属advisory xact lock+FOR UPDATE锁定108行；
 *   逐行旧hash核对→原位UPDATE→新hash核对；1批次+恰好108条entries；COMMIT前终态
 *   指纹核对；任一漂移整体回滚；复跑noop；部分完成REWRITE_STATE_DRIFT禁止补写；
 * - RCL_REWRITE_INJECT_FAILURE_AT=after_lock|after_updates|after_entries 仅隔离演练
 *   注入故障点（验证整体回滚），持久执行禁止；
 * - 退出码：0成功/noop；2用法/授权/防误写/工作树拒绝；3 PLAN_HASH_MISMATCH；
 *   4 TARGET_FINGERPRINT_MISMATCH；5 REWRITE_STATE_DRIFT；6前置条件/计划正文不符；
 *   1其他错误。
 */
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");

if (!process.env.RCL_REWRITE_UNDER_TSX) {
  const tsxCli = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const r = spawnSync(process.execPath, [tsxCli, SELF, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, RCL_REWRITE_UNDER_TSX: "1" },
  });
  process.exit(r.status ?? 1);
}

const core = await import("../src/lib/case-rewrite/rewrite-v2.ts");
// （.mjs入口与rcl-repair-forward-task34.mjs同模式：不经tsc类型检查，经tsx动态import类型化核心。）
const pg = (await import("pg")).default;

const EXIT_BY_CODE = {
  USAGE: 2,
  AUTHORIZATION_REQUIRED: 2,
  PERSISTENT_TARGET_REFUSED: 2,
  DIRTY_WORKTREE: 2,
  CODE_SHA_MISMATCH: 2,
  DATABASE_URL_REQUIRED: 2,
  PLAN_HASH_MISMATCH: 3,
  TARGET_FINGERPRINT_MISMATCH: 4,
  REWRITE_STATE_DRIFT: 5,
  MATCH_FAILED: 6,
  PLAN_INVALID: 6,
  PLAN_FILE_MISSING: 6,
  GENERATED_FILE_MISSING: 6,
  INJECTED_FAILURE: 7,
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
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

async function main() {
  const argv = process.argv.slice(2);
  const args = core.parseRewriteArgs(argv);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new core.CaseRewriteError("DATABASE_URL_REQUIRED", "DATABASE_URL 必须进程显式设置（禁止dotenv回退）");
  }

  const generatedPath = path.resolve(process.cwd(), args.generated);
  if (!existsSync(generatedPath)) {
    throw new core.CaseRewriteError("GENERATED_FILE_MISSING", `生成产物缺失：${generatedPath}（先运行 rcl-case-library.ts generate-v2）`);
  }
  // 防误写前置：目标库名为policyops时，apply在任何连接尝试之前拒绝。
  if (args.mode === "apply" && databaseName(databaseUrl) === "policyops" && process.env.RCL_REWRITE_ALLOW_PERSISTENT !== "1") {
    throw new core.CaseRewriteError(
      "PERSISTENT_TARGET_REFUSED",
      "目标库名为policyops：持久执行默认拒绝。需用户fresh授权并显式设置RCL_REWRITE_ALLOW_PERSISTENT=1",
    );
  }
  // plan/audit为只读模式；为避免只读路径误连持久库，policyops上同样仅在显式
  // RCL_REWRITE_ALLOW_PERSISTENT=1时放行（开发阶段审计/计划只针对隔离库）。
  if ((args.mode === "audit" || args.mode === "plan") && databaseName(databaseUrl) === "policyops" && process.env.RCL_REWRITE_ALLOW_PERSISTENT !== "1") {
    throw new core.CaseRewriteError("PERSISTENT_TARGET_REFUSED", "目标库名为policyops：开发阶段的audit/plan只允许隔离库；如需只读审计请显式设置RCL_REWRITE_ALLOW_PERSISTENT=1");
  }

  const source = JSON.parse(readFileSync(generatedPath, "utf8"));

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (args.mode === "audit") {
      const audit = await core.auditRewrite({ client, source, databaseName: databaseName(databaseUrl) });
      emit(audit);
      if (audit.state === "drift") process.exit(5);
      return;
    }

    if (args.mode === "plan") {
      const head = gitHead();
      const rows = await core.fetchFingerprintRows(client);
      const matched = core.matchRowsToScenarios({
        caseRows: rows.cases,
        showcaseRows: rows.showcases,
        testRows: rows.tests,
        scenarios: source.scenarios,
      });
      const plan = core.buildRewritePlan({
        codeSha: head.sha,
        source,
        targetFingerprint: core.rowsFingerprint(rows),
        matched,
        snapshotRows: rows.snapshots,
        releaseRows: rows.releases,
        exampleTestRows: rows.tests.filter((t) => t.source === "example"),
      });
      const outDir = path.resolve(process.cwd(), args.out ?? ".");
      mkdirSync(outDir, { recursive: true });
      const planFile = path.join(outDir, "rewrite-plan-v2.json");
      writeFileSync(planFile, JSON.stringify(plan, null, 2) + "\n", "utf8");
      emit({
        mode: "plan",
        batchId: plan.batchId,
        planHash: plan.planHash,
        targetFingerprint: plan.targetFingerprint,
        finalFingerprint: plan.finalFingerprint,
        entries: plan.entries.length,
        codeSha: plan.codeSha,
        snapshotBindings: plan.snapshotBindings,
        planFile: path.relative(process.cwd(), planFile),
      });
      return;
    }

    if (args.mode === "apply") {
      const planFile = path.resolve(process.cwd(), args.planFile);
      if (!existsSync(planFile)) {
        throw new core.CaseRewriteError("PLAN_FILE_MISSING", `计划文件缺失：${planFile}`);
      }
      const plan = JSON.parse(readFileSync(planFile, "utf8"));
      const recomputed = core.rewritePlanHash(plan);
      if (recomputed !== args.planHash) {
        throw new core.CaseRewriteError("PLAN_HASH_MISMATCH", `--plan-hash与计划正文不符：声明${args.planHash} 重算${recomputed}`);
      }
      if (args.targetFingerprint !== plan.targetFingerprint) {
        throw new core.CaseRewriteError("TARGET_FINGERPRINT_MISMATCH", `--target-fingerprint与计划不符：参数${args.targetFingerprint} 计划${plan.targetFingerprint}`);
      }
      const bodyProblems = core.verifyPlanBody(plan);
      if (bodyProblems.length > 0) {
        throw new core.CaseRewriteError("PLAN_INVALID", `计划正文自校验失败：${bodyProblems.slice(0, 5).join("；")}`);
      }
      const head = gitHead();
      if (head.dirty && process.env.RCL_REWRITE_ALLOW_DIRTY !== "1") {
        throw new core.CaseRewriteError("DIRTY_WORKTREE", "工作树存在未提交改动：apply拒绝（隔离演练可显式RCL_REWRITE_ALLOW_DIRTY=1）");
      }
      if (head.sha !== plan.codeSha) {
        throw new core.CaseRewriteError(
          "CODE_SHA_MISMATCH",
          `HEAD ${head.sha} ≠ 计划绑定codeSha ${plan.codeSha}（重新plan以绑定当前代码）`,
        );
      }
      const inject = process.env.RCL_REWRITE_INJECT_FAILURE_AT || undefined;
      const result = await core.executeRewriteApply({
        client,
        source,
        plan,
        actor: args.actor ?? "rcl-case-rewrite-v2",
        injectFailureAt: inject,
      });
      emit(result);
      return;
    }

    // verify
    const planFile = path.resolve(process.cwd(), args.planFile);
    if (!existsSync(planFile)) {
      throw new core.CaseRewriteError("PLAN_FILE_MISSING", `计划文件缺失：${planFile}`);
    }
    const plan = JSON.parse(readFileSync(planFile, "utf8"));
    const result = await core.verifyRewrite({ client, source, plan });
    emit(result);
    if (!result.ok) process.exit(5);
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => fail(err));
