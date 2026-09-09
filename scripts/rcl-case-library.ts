/**
 * RCL-FR-021 地区化案例库受控执行器（七种真实模式，2026-09-09复审P0修复）：
 *
 *   npx tsx scripts/rcl-case-library.ts audit
 *   npx tsx scripts/rcl-case-library.ts generate --storage <dir>
 *   npx tsx scripts/rcl-case-library.ts plan-replacement --storage <dir>
 *   npx tsx scripts/rcl-case-library.ts prepare-archive --storage <dir> [--pgdump <cmd>]
 *   npx tsx scripts/rcl-case-library.ts verify-archive --storage <dir> --batch-id <id>
 *   npx tsx scripts/rcl-case-library.ts apply --storage <dir> --batch-id <id> --i-am-authorized
 *   npx tsx scripts/rcl-case-library.ts verify --storage <dir>
 *
 * 每个模式调用 `src/lib/case-governance/executor.ts` 的真实业务逻辑，输出可验证
 * JSON（计数/指纹/manifestHash/删除插入计数/核对结果）并按失败原因返回非零退出码；
 * 只打印说明后退出视为失败（复审P0）。默认只读audit（RCL-FR-021）；
 * apply 必须携带 --i-am-authorized 与 manifestHash 一致的归档。
 *
 * - DATABASE_URL 必须进程显式设置且仅限本机（assertLocalDatabaseUrl，禁止dotenv回退）；
 * - 归档写入 --storage 目录（Git忽略路径，不进入镜像或提交）；
 * - 持久库0018/删除/插入/归档状态写入不在本脚本范围（由WI-20260907-04受控执行）。
 */
import "../src/lib/env/load-environment";
import { assertLocalDatabaseUrl } from "../src/lib/db/guard";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import {
  auditRcl,
  prepareRclArchive,
  verifyRclArchive,
  generateRclScenarios,
  planRclReplacement,
  applyRclReplacement,
  verifyRclReplacement,
  RclExecutorError,
} from "@/lib/case-governance/executor";
import type { GeneratedScenario } from "@/lib/case-governance/generator";
import { computeJurisdictionPlan } from "@/server/modules/planning/application/jurisdiction-compute.use-case";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";
import { DrizzlePolicyConflictRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzleJurisdictionPlanningReadRepository } from "@/server/modules/planning/infrastructure/drizzle/jurisdiction-planning-read.repository";
import { DrizzlePlanningWriteRepository } from "@/server/modules/planning/infrastructure/drizzle/planning-write.repository";
import type { RclManifest } from "@/lib/case-governance/manifest";

const DATABASE_URL = assertLocalDatabaseUrl();

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function jsonOut(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

async function main() {
  const [mode] = process.argv.slice(2);
  if (!mode) {
    process.stderr.write(
      "用法：rcl-case-library.ts audit | generate | plan-replacement | prepare-archive | verify-archive | apply | verify\n",
    );
    process.exit(1);
  }
  process.stderr.write(`[rcl-case-library] mode=${mode} database=${new URL(DATABASE_URL).host}\n`);

  switch (mode) {
    case "audit": {
      // RCL-FR-021/RCL-NFR-003：只读审计——真实计数与目标指纹。
      const result = await auditRcl(db);
      jsonOut(result);
      break;
    }
    case "generate": {
      // RCL-FR-007/008/014：真实生成36条场景，期望由快照规划器计算。
      const storageDir = arg("--storage");
      if (!storageDir) throw new RclExecutorError("generate 需要 --storage <dir>");
      mkdirSync(storageDir, { recursive: true });
      const tree = createJurisdictionTreeService({ read: new DrizzleJurisdictionReadRepository() });
      const resolveChain = async (code: string) => {
        const nodes = await tree.resolveChain(code);
        return nodes.map((n) => ({ code: n.code, name: n.name, level: n.level, path: n.path }));
      };
      const reads = new DrizzleJurisdictionPlanningReadRepository();
      const result = await generateRclScenarios({
        db,
        computeExpected: async (t) => {
          const release = await reads.getActiveRelease(t.jurisdictionCode, t.asOfDate);
          if (!release?.activeSnapshotId) {
            throw new RclExecutorError(`地区 ${t.jurisdictionCode} ${t.asOfDate} 无active快照（RCL-FR-007 fail-closed）`);
          }
          const snap = await reads.getSnapshot(release.activeSnapshotId);
          if (!snap) throw new RclExecutorError("快照缺失（RCL-FR-007 fail-closed）");
          const planResult = await computeJurisdictionPlan(
            {
              user: t.input,
              jurisdictionCode: t.jurisdictionCode,
              asOfDate: t.asOfDate,
              ownerUserId: "rcl-cli-generator",
              persist: false,
            },
            {
              resolveChain,
              getActiveRelease: (code, asOfDate) => reads.getActiveRelease(code, asOfDate),
              hasAnyRelease: (code) => reads.hasAnyRelease(code),
              getSnapshot: (id) => reads.getSnapshot(id),
              listOpenConflicts: (code) => new DrizzlePolicyConflictRepository().listConflicts({ status: "open", jurisdictionCode: code }),
              savePlan: new DrizzlePlanningWriteRepository().savePlan.bind(new DrizzlePlanningWriteRepository()),
            },
          );
          const calc = planResult.calc as Record<string, unknown>;
          const values = t.assertionSpecs.map((spec) => {
            const keys = spec.path.replace(/^calc\./, "").split(".");
            const value = keys.reduce<unknown>(
              (acc, k) => (acc !== null && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined),
              calc,
            );
            return { path: spec.path, value };
          });
          return { snapshotId: snap.snapshot.id, snapshotContentHash: snap.snapshot.contentHash, values };
        },
      });
      writeFileSync(
        path.join(storageDir, "generated-scenarios.json"),
        JSON.stringify({ scenarios: result.scenarios, coverageManifest: result.coverageManifest, snapshotMap: result.snapshotMap }, null, 2),
      );
      jsonOut({
        scenarioCount: result.scenarios.length,
        shanghai: result.scenarios.filter((s) => s.jurisdictionCode === "310000").length,
        guangdong: result.scenarios.filter((s) => s.jurisdictionCode === "440000").length,
        coverageManifestHash: result.coverageManifest.manifestHash,
        snapshotMap: result.snapshotMap,
        generatedFile: "generated-scenarios.json",
      });
      break;
    }
    case "plan-replacement": {
      // RCL-FR-006/018/AC-003：绑定旧目标行与完整新行构建精确manifest。
      const storageDir = arg("--storage");
      if (!storageDir) throw new RclExecutorError("plan-replacement 需要 --storage <dir>");
      const generatedPath = arg("--generated") ?? path.join(storageDir, "generated-scenarios.json");
      if (!existsSync(generatedPath)) throw new RclExecutorError(`生成产物缺失：${generatedPath}（先执行 generate）`);
      const generated = JSON.parse(readFileSync(generatedPath, "utf-8")) as {
        scenarios: GeneratedScenario[];
        snapshotMap: Record<string, { id: string; hash: string }>;
      };
      const result = await planRclReplacement({
        db,
        scenarios: generated.scenarios,
        snapshotMap: generated.snapshotMap,
      });
      writeFileSync(path.join(storageDir, "manifest.json"), JSON.stringify(result.manifest, null, 2));
      jsonOut({
        manifestHash: result.manifestHash,
        caseCount: result.manifest.caseCount,
        showcaseCount: result.manifest.showcaseCount,
        testCount: result.manifest.newTestCount,
        oldTargets: {
          cases: result.manifest.oldTargets.cases.length,
          showcase: result.manifest.oldTargets.showcase.length,
          tests: result.manifest.oldTargets.tests.length,
        },
        manifestFile: "manifest.json",
      });
      break;
    }
    case "prepare-archive": {
      // RCL-FR-002/003/005：dump+selection+manifest+pending restore+sha256sums（最后）。
      const storageDir = arg("--storage");
      if (!storageDir) throw new RclExecutorError("prepare-archive 需要 --storage <dir>");
      mkdirSync(storageDir, { recursive: true });
      const manifestPath = arg("--manifest") ?? path.join(storageDir, "manifest.json");
      if (!existsSync(manifestPath)) throw new RclExecutorError(`manifest缺失：${manifestPath}（先执行 plan-replacement）`);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as RclManifest;
      const pgDumpCmd = arg("--pgdump") ?? "pg_dump";
      const dockerContainer = arg("--pgdump-docker");
      const runDump = (table?: string): Promise<Buffer> => {
        const url = new URL(DATABASE_URL);
        const dbName = url.pathname.replace(/^\//, "");
        if (dockerContainer) {
          // 容器内经unix socket dump（-h/-p不适用）。
          const args = ["exec", dockerContainer, "pg_dump", "-U", url.username || "postgres", "-Fc"];
          if (table) args.push("-t", table);
          args.push(dbName);
          return Promise.resolve(execFileSync("docker", args, { maxBuffer: 512 * 1024 * 1024 }));
        }
        const args = ["-U", url.username || "postgres", "-h", url.hostname, "-p", url.port || "5432", "-Fc"];
        if (table) args.push("-t", table);
        args.push(dbName);
        return Promise.resolve(execFileSync(pgDumpCmd, args, { env: { ...process.env, PGPASSWORD: url.password ?? "" }, maxBuffer: 512 * 1024 * 1024 }));
      };
      const result = await prepareRclArchive({
        db,
        storageDir,
        pgDump: runDump,
        manifest,
        selection: {
          curatedUids: manifest.newShowcase.map((s) => s.uid ?? ""),
          sourceCounts: { "310000": manifest.newShowcase.filter((s) => s.jurisdictionCode === "310000").length, "440000": manifest.newShowcase.filter((s) => s.jurisdictionCode === "440000").length },
          quotaStats: {},
          violations: [],
        },
        createdBy: "rcl-cli",
      });
      jsonOut({ batchId: result.batchId, files: result.files, sha256sums: result.sha256sums });
      break;
    }
    case "verify-archive": {
      // RCL-FR-005/AC-001/002：文件SHA+必备文件+restore verified → 批次restore_verified。
      const storageDir = arg("--storage");
      const batchId = arg("--batch-id");
      if (!storageDir || !batchId) throw new RclExecutorError("verify-archive 需要 --storage <dir> --batch-id <id>");
      const result = await verifyRclArchive({ db, storageDir, batchId });
      jsonOut(result);
      if (!result.ok) process.exit(2);
      break;
    }
    case "apply": {
      // RCL-FR-018/019/021：授权+manifestHash核对+事务内受控替换。
      const storageDir = arg("--storage");
      const batchId = arg("--batch-id");
      if (!storageDir || !batchId) throw new RclExecutorError("apply 需要 --storage <dir> --batch-id <id>");
      if (!hasFlag("--i-am-authorized")) {
        process.stderr.write("[rcl-case-library] apply需要显式授权参数 --i-am-authorized（RCL-FR-021）\n");
        process.exit(1);
      }
      const manifestPath = arg("--manifest") ?? path.join(storageDir, "manifest.json");
      if (!existsSync(manifestPath)) throw new RclExecutorError(`manifest缺失：${manifestPath}`);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as RclManifest;
      const result = await applyRclReplacement({ db, manifest, batchId, actor: "rcl-cli-admin", authorized: true });
      jsonOut(result);
      break;
    }
    case "verify": {
      // RCL-AC-008/011/012：最终计数N/36/N+42与配额、字段完整性核对。
      const storageDir = arg("--storage");
      if (!storageDir) throw new RclExecutorError("verify 需要 --storage <dir>");
      const manifestPath = arg("--manifest") ?? path.join(storageDir, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as RclManifest;
      const result = await verifyRclReplacement({
        db,
        counts: { cases: manifest.counts.cases, showcase: manifest.counts.showcase, tests: manifest.counts.tests },
        showcaseByRegion: { "310000": 18, "440000": 18 },
        quota: {
          gender: { male: 18, female: 18 },
          band: { before_1970: 12, "1970_1979": 12, from_1980: 12 },
          employment: { employed: 12, flexible: 12, unemployed: 12 },
        },
      });
      jsonOut(result);
      if (!result.ok) process.exit(2);
      break;
    }
    default:
      process.stderr.write(`未知模式：${mode}\n`);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
