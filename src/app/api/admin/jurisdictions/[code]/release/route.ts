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
  ReleaseSnapshotError,
} from "@/server/modules/publishing/application/jurisdiction-release.use-case";
import { DrizzleJurisdictionReleaseWriteRepository } from "@/server/modules/publishing/infrastructure/drizzle/jurisdiction-release.repository";
import { DrizzlePolicySnapshotRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzlePolicyConflictRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";

export const dynamic = "force-dynamic";

const ActivateBodySchema = z.object({
  snapshot_id: z.string().uuid("snapshot_id 必须是快照 UUID"),
});

/**
 * POST /api/admin/jurisdictions/:code/release（任务3 JRP-FR-005/006/007）：
 * 地区规划发布记录激活/切换。只允许新鲜管理员身份；激活必须绑定与发布地区
 * 相同的已存在快照且无未解决冲突；禁止直接 SQL 修改发布状态（JRP-FR-006）。
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
            },
            members: snap.members,
          };
        },
        listOpenConflicts: (jc) => conflictRepo.listConflicts({ status: "open", jurisdictionCode: jc }),
        upsert: (data) => releaseWrite.upsertActiveRelease(data),
        now: () => new Date(),
      },
      {
        jurisdictionCode: code,
        snapshotId: parsed.data.snapshot_id,
        actor: { id: gate.actor.userId, role: actorRole, status: "active" },
      },
    );

    return NextResponse.json({ release });
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    if (
      err instanceof ReleaseAuthorizationError ||
      err instanceof ReleaseSnapshotError ||
      err instanceof ReleaseConflictError
    ) {
      const status = err instanceof ReleaseSnapshotError ? 422 : 403;
      return NextResponse.json({ error: err.message }, { status });
    }
    const mapped = mapRouteError(err, {
      operation: "admin.jurisdiction.release",
    });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
