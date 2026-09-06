/** 持久库audit快照（只读，不执行repair/apply）：输出manifest哈希、漂移、幂等标志。 */
import { writeFileSync } from "node:fs";
import { auditMaterialization } from "../src/lib/policy-materialization/materialize";
import { buildManifest, manifestHash } from "../src/lib/policy-materialization/manifest";
import { productionGitReader } from "../src/lib/policy-materialization/git-reader";

async function main() {
  const manifest = buildManifest(productionGitReader);
  const worktreeClean = !productionGitReader.isWorktreeDirty("dsl/regions");
  const report = await auditMaterialization(manifest, worktreeClean);
  const out = {
    mode: "audit",
    target: report.target,
    manifestHash: report.manifestHash,
    manifestHashOfBuildManifest: manifestHash(manifest),
    sourceCommit: report.sourceCommit,
    targetFingerprint: report.targetFingerprint,
    worktreeClean: report.worktreeClean,
    existingCounts: report.existingCounts,
    expectedPostCounts: report.expectedPostCounts,
    idempotentNoOp: report.idempotentNoOp,
    packSnapshotDrift: report.packSnapshotDrift,
    regions: report.plan.regions.map((r) => ({
      jurisdictionCode: r.jurisdictionCode,
      readiness: r.readiness,
      blockingReasons: r.blockingReasons,
      counts: r.counts,
    })),
  };
  writeFileSync("audit-policyops-stage-e-fix.json", JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify({
      idempotentNoOp: out.idempotentNoOp,
      packSnapshotDrift: out.packSnapshotDrift,
      worktreeClean: out.worktreeClean,
    }),
  );
  process.exit(0);
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
