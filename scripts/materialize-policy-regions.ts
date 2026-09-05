/**
 * 09-05 阶段E 受控物化CLI（NRP-FR-017～022 / NRP-AC-011～016）。
 *
 * 用法：
 *   node scripts/materialize-policy-regions.mjs                # 默认audit（只读）
 *   node scripts/materialize-policy-regions.mjs audit
 *   node scripts/materialize-policy-regions.mjs apply \
 *     --i-am-authorized --manifest-hash <hash> --target-fingerprint <fp> [--actor 名字]
 *
 * 约束：
 * - DATABASE_URL必须显式设置在进程环境中（禁止dotenv/.env回退），且只允许
 *   本机 localhost:5432/policyops（NRP-NFR-009）；
 * - 默认只audit；apply同时校验授权参数、manifest哈希与目标指纹，缺一拒绝；
 * - 不调用npm run seed；只写draft实体与批次审计，单事务原子提交。
 * 输出不含连接串与凭据（NRP-NFR-009）。
 */
import "@/lib/policy-materialization/no-env-fallback";
import { buildManifest, manifestHash } from "@/lib/policy-materialization/manifest";
import { productionGitReader } from "@/lib/policy-materialization/git-reader";
import {
  applyMaterialization,
  auditMaterialization,
  ApplyGuardError,
} from "@/lib/policy-materialization/materialize";

function parseArgs(argv: string[]): {
  mode: "audit" | "apply";
  authorized: boolean;
  manifestHash: string;
  targetFingerprint: string;
  actor: string;
} {
  const [modeArg, ...rest] = argv;
  const mode = modeArg === "apply" ? "apply" : "audit";
  const opts = {
    mode,
    authorized: false,
    manifestHash: "",
    targetFingerprint: "",
    actor: "stage-e-operator",
  } as ReturnType<typeof parseArgs>;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--i-am-authorized") opts.authorized = true;
    else if (arg === "--manifest-hash") opts.manifestHash = rest[++i] ?? "";
    else if (arg === "--target-fingerprint") opts.targetFingerprint = rest[++i] ?? "";
    else if (arg === "--actor") opts.actor = rest[++i] ?? opts.actor;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = buildManifest(productionGitReader);
  const worktreeClean = !productionGitReader.isWorktreeDirty("dsl/regions");

  if (opts.mode === "audit") {
    const report = await auditMaterialization(manifest, worktreeClean);
    console.log(
      JSON.stringify(
        {
          mode: "audit",
          target: report.target,
          manifestHash: report.manifestHash,
          sourceCommit: report.sourceCommit,
          targetFingerprint: report.targetFingerprint,
          worktreeClean: report.worktreeClean,
          existingCounts: report.existingCounts,
          expectedPostCounts: report.expectedPostCounts,
          existingBatches: report.existingBatches,
          idempotentNoOp: report.idempotentNoOp,
          planCounts: report.plan.counts,
          regions: report.plan.regions.map((r) => ({
            jurisdictionCode: r.jurisdictionCode,
            readiness: r.readiness,
            blockingReasons: r.blockingReasons,
            counts: r.counts,
          })),
        },
        null,
        2,
      ),
    );
    console.log(
      "[materialize] audit完成（只读，零写入）。apply命令请携带 --i-am-authorized --manifest-hash --target-fingerprint。",
    );
    return;
  }

  const result = await applyMaterialization(
    {
      authorized: opts.authorized,
      expectedManifestHash: opts.manifestHash,
      expectedTargetFingerprint: opts.targetFingerprint,
      manifest,
      worktreeClean,
      actor: opts.actor,
    },
  );
  if (result.noop) {
    console.log(
      JSON.stringify({ mode: "apply", noop: true, counts: result.counts }, null, 2),
    );
    console.log("[materialize] 相同manifest已应用，幂等no-op（NRP-AC-014）。");
    return;
  }
  console.log(
    JSON.stringify(
      {
        mode: "apply",
        noop: false,
        batches: result.batches,
        counts: result.counts,
        publishedRowsHashUnchanged:
          result.publishedRowsHashBefore === result.publishedRowsHashAfter,
      },
      null,
      2,
    ),
  );
  console.log("[materialize] 四地区draft物化完成（单事务），旧行哈希不变。");
}

main().catch((err) => {
  if (err instanceof ApplyGuardError) {
    console.error(`[materialize] 拒绝执行（${err.reason}）：${err.message}`);
  } else {
    console.error(`[materialize] 失败：${(err as Error).message}`);
  }
  process.exit(1);
});
