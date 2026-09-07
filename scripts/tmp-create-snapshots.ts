/** 任务2首期三地区候选快照创建与重放验证（一次写入+重放，四川不创建）。 */
import { createPolicySnapshotService } from "../src/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "../src/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "../src/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

async function main() {
  const service = createPolicySnapshotService({
    resolveChain: async (code) => {
      const tree = createJurisdictionTreeService({ read: new DrizzleJurisdictionReadRepository() });
      return (await tree.resolveChain(code)).map((n) => ({ code: n.code, name: n.name, path: n.path }));
    },
  });
  const asOf = process.env.SNAPSHOT_AS_OF ?? "2026-09-07";
  const out: Record<string, unknown> = { asOf };
  for (const jur of ["CN", "310000", "440000"]) {
    const created = await service.createPolicySnapshot({ jurisdictionCode: jur, asOfDate: asOf, actor: "admin" });
    const replay = await service.createPolicySnapshot({ jurisdictionCode: jur, asOfDate: asOf, actor: "admin" });
    out[jur] = {
      snapshotId: created.snapshotId,
      resolvedPath: created.resolvedPath,
      contentHash: created.contentHash,
      ruleCount: created.ruleCount,
      paramCount: created.paramCount,
      ruleSetCount: created.ruleSetCount,
      replayHashIdentical: created.contentHash === replay.contentHash,
    };
  }
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error("fatal:", e.message); process.exit(1); });
