import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActor } from "@/lib/auth/require-actor";
import { mapRouteError } from "@/lib/api/route-errors";
import { requireFreshAdmin } from "@/server/modules/identity/application/admin-users.use-case";
import { IdentityError } from "@/server/modules/identity/application/errors";
import { getIdentityDeps } from "@/server/modules/identity/infrastructure/identity-container";
import {
  activateJurisdictionRelease,
  ReleaseAuthorizationError,
  ReleaseConflictError,
  ReleaseGateError,
  ReleaseSnapshotError,
} from "@/server/modules/publishing/application/jurisdiction-release.use-case";
import { DrizzleJurisdictionReleaseWriteRepository } from "@/server/modules/publishing/infrastructure/drizzle/jurisdiction-release.repository";
import { DrizzlePolicySnapshotRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzlePolicyConflictRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { rulesReads } from "@/server/modules/rules/application";

export const dynamic = "force-dynamic";

const ActivateBodySchema = z.object({
  snapshot_id: z.string().uuid("snapshot_id 必须是快照 UUID"),
  // JRP-FR-024：激活区间必须闭合定义（effective_from 必填；effective_to 开放可选）。
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effective_from 必须是 YYYY-MM-DD"),
  effective_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "effective_to 必须是 YYYY-MM-DD")
    .nullable()
    .optional(),
});

/**
 * POST /api/admin/jurisdictions/:code/releases（任务3 JRP-FR-005/006/007/024）：
 * 地区规划发布记录激活/切换。只允许新鲜管理员身份；激活必须真实运行七道门禁
 * （引用/Schema/参数依赖/冲突/黄金测试/双重重放/内容哈希，JRP-FR-007/AC-007），
 * 全部通过后写入带闭合区间的 active 发布记录；禁止直接 SQL 修改发布状态。
 * 激活新快照不修改或删除旧快照（JRP-NFR-006）。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { code } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const parsed = ActivateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    // JRP-FR-006/AC-010：普通用户或非新鲜管理员一律拒绝（proxy 已按 admin 角色过滤，
    // 此处再经 requireFreshAdmin 数据库回读校验 role/status/authVersion）。
    const freshAdmin = await requireFreshAdmin(
      getIdentityDeps(),
      { userId: gate.actor.userId, authVersion: gate.actor.authVersion },
    );
    const actorRole = freshAdmin.role;

    const snapshotRepo = new DrizzlePolicySnapshotRepository();
    const conflictRepo = new DrizzlePolicyConflictRepository();
    const releaseWrite = new DrizzleJurisdictionReleaseWriteRepository();

    const release = await activateJurisdictionRelease(
      {
        requireAdmin: async () => ({ ok: true }),
        getSnapshot: async (snapshotId) => {
          const snap = await snapshotRepo.getSnapshot(snapshotId);
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
        listOpenConflicts: (jc) => conflictRepo.listConflicts({ status: "open", jurisdictionCode: jc }),
        loadTests: (jurisdictionCodes) =>
          rulesReads.listTests({ jurisdictionCodes }),
        // 参数依赖门禁：窗口外参数（如广东2030参数对2026快照）仍视为有效
        // （JRP-FR-020 能力级缺口），只拒绝拼写/断裂引用（JRP-FR-007）。
        listParamKeys: async (jurisdictionCodes) => {
          const rows = await rulesReads.listParams({ status: "published" });
          return rows
            .filter(
              (p) =>
                p.jurisdictionCode !== null &&
                jurisdictionCodes.includes(p.jurisdictionCode),
            )
            .map((p) => p.paramId);
        },
        upsert: (data) => releaseWrite.upsertActiveRelease(data),
        now: () => new Date(),
      },
      {
        jurisdictionCode: code,
        snapshotId: parsed.data.snapshot_id,
        effectiveFrom: parsed.data.effective_from,
        effectiveTo: parsed.data.effective_to ?? null,
        actor: { id: gate.actor.userId, role: actorRole, status: "active" },
      },
    );

    return NextResponse.json({ release });
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    if (err instanceof ReleaseAuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ReleaseSnapshotError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof ReleaseConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ReleaseGateError) {
      // JRP-AC-007：门禁失败 422，带真实 gateResults（不回传内部引用细节）。
      return NextResponse.json(
        { error: err.message, gate_results: err.gateResults },
        { status: 422 },
      );
    }
    const mapped = mapRouteError(err, {
      operation: "admin.jurisdiction.release",
    });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
