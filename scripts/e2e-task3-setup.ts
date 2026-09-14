/**
 * 任务3 Chromium E2E 前置数据准备（JRP-AC-001/004/006/008/009/010）：
 *
 * 在全新隔离 E2E 库（已 migration + bootstrap + seed）上为上海/广东创建候选
 * 快照并经真实七道门禁激活非重叠发布区间，使 E2E 能真实走通：
 * - 聊天/直接页地区确认后计算 plan；
 * - 历史 plan replay（三方 hash 一致）；
 * - 管理员停用（含跨地区拒绝反例）。
 *
 * 用法：SOCILA_E2E_DATABASE_URL=<连接串> npx tsx scripts/e2e-task3-setup.ts
 * 输出：仓库根 .e2e-task3-state.json（{sh,g d}ReleaseId/snapshotId；E2E spec 读取；
 * 跑完即删，不进 Git）。
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@/lib/db";
import { jurisdictionPlanningReleases } from "@/lib/db/schema";
import { createPolicySnapshotService } from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";
import { DrizzlePolicySnapshotRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzlePolicyConflictRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzleRulesReadRepository } from "@/server/modules/rules/infrastructure/drizzle/rules-read.repository";
import { DrizzleJurisdictionReleaseWriteRepository } from "@/server/modules/publishing/infrastructure/drizzle/jurisdiction-release.repository";
import { activateJurisdictionRelease } from "@/server/modules/publishing/application/jurisdiction-release.use-case";

const url = process.env.SOCILA_E2E_DATABASE_URL;
if (!url) {
  console.error("[e2e-task3-setup] SOCILA_E2E_DATABASE_URL 未设置");
  process.exit(1);
}
process.env.DATABASE_URL = url;

const tree = createJurisdictionTreeService({
  read: new DrizzleJurisdictionReadRepository(),
});
const resolveChain = async (code: string) => {
  const nodes = await tree.resolveChain(code);
  return nodes.map((n) => ({
    code: n.code,
    name: n.name,
    level: n.level,
    path: n.path,
  }));
};
const snapRepo = new DrizzlePolicySnapshotRepository();
const conflictRepo = new DrizzlePolicyConflictRepository();
const rulesReads = new DrizzleRulesReadRepository();
const releaseWrite = new DrizzleJurisdictionReleaseWriteRepository();

async function activate(code: string, asOfDate: string) {
  const svc = createPolicySnapshotService({ resolveChain });
  const created = await svc.createPolicySnapshot({
    jurisdictionCode: code,
    asOfDate,
    actor: "e2e-task3-setup",
  });
  await activateJurisdictionRelease(
    {
      requireAdmin: async () => ({ ok: true }),
      getSnapshot: async (snapshotId) => {
        const snap = await snapRepo.getSnapshot(snapshotId);
        if (!snap) return null;
        return {
          snapshot: {
            id: snap.snapshot.id,
            jurisdictionCode: snap.snapshot.jurisdictionCode,
            contentHash: snap.snapshot.contentHash,
            asOfDate: snap.snapshot.asOfDate,
          },
          members: snap.members.map((m) => ({
            entityType: m.entityType as "rule" | "param" | "rule_set",
            businessKey: m.businessKey,
            payload: m.payload as Record<string, unknown>,
            provenance: m.provenance,
          })),
        };
      },
      listOpenConflicts: (jc) =>
        conflictRepo.listConflicts({ status: "open", jurisdictionCode: jc }),
      loadTests: (codes) => rulesReads.listTests({ jurisdictionCodes: codes }),
      listParamKeys: async (codes) => {
        const rows = await rulesReads.listParams({ status: "published" });
        return rows
          .filter(
            (p) =>
              p.jurisdictionCode !== null && codes.includes(p.jurisdictionCode),
          )
          .map((p) => p.paramId);
      },
      upsert: (data) => releaseWrite.upsertActiveRelease(data),
      now: () => new Date("2026-09-07T10:00:00.000Z"),
    },
    {
      jurisdictionCode: code,
      snapshotId: created.snapshotId,
      effectiveFrom: asOfDate,
      effectiveTo: null,
      actor: { id: "e2e-setup-admin", role: "admin", status: "active" },
    },
  );
  const release = await releaseWrite.getByJurisdiction(code);
  if (!release) throw new Error(`release not found for ${code}`);
  return { snapshotId: created.snapshotId, releaseId: release.id };
}

async function main() {
  // 清空既有发布区间，保证 E2E 库状态确定（不删除快照/plan）。
  await db.delete(jurisdictionPlanningReleases);
  const sh = await activate("310000", "2026-09-01");
  const gd = await activate("440000", "2026-09-01");
  const state = {
    sh: { ...sh, jurisdictionCode: "310000" },
    gd: { ...gd, jurisdictionCode: "440000" },
  };
  writeFileSync(
    resolve(process.cwd(), ".e2e-task3-state.json"),
    JSON.stringify(state, null, 2),
  );
  console.log(
    `[e2e-task3-setup] ok: SH release=${state.sh.releaseId} GD release=${state.gd.releaseId}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[e2e-task3-setup] failed:", err);
  process.exit(1);
});
