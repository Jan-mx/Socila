import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/require-actor";
import { mapRouteError } from "@/lib/api/route-errors";
import { requireFreshAdmin } from "@/server/modules/identity/application/admin-users.use-case";
import { IdentityError } from "@/server/modules/identity/application/errors";
import { getIdentityDeps } from "@/server/modules/identity/infrastructure/identity-container";
import {
  deactivateJurisdictionRelease,
  ReleaseAuthorizationError,
  ReleaseNotFoundError,
} from "@/server/modules/publishing/application/jurisdiction-release.use-case";
import { DrizzleJurisdictionReleaseWriteRepository } from "@/server/modules/publishing/infrastructure/drizzle/jurisdiction-release.repository";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/jurisdictions/:code/releases/:releaseId（任务3 JRP-FR-027/AC-009）：
 * 停用单一发布区间。只允许新鲜管理员；停用只改状态为 inactive，
 * 不删除快照或历史 plan；广东停用不影响上海（区间隔离）。
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string; releaseId: string }> },
) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { code: _code, releaseId } = await params;
  void _code;
  const releaseIdNum = Number(releaseId);
  if (!Number.isInteger(releaseIdNum) || releaseIdNum <= 0) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const freshAdmin = await requireFreshAdmin(
      getIdentityDeps(),
      { userId: gate.actor.userId, authVersion: gate.actor.authVersion },
    );
    const actorRole = freshAdmin.role;
    const releaseWrite = new DrizzleJurisdictionReleaseWriteRepository();

    const deactivated = await deactivateJurisdictionRelease(
      {
        requireAdmin: async () => ({ ok: true }),
        getSnapshot: async () => null,
        listOpenConflicts: async () => [],
        loadTests: async () => [],
        upsert: releaseWrite.upsertActiveRelease.bind(releaseWrite),
        getById: (id) => releaseWrite.getById(id),
        deactivateById: (id) => releaseWrite.deactivateById(id),
        now: () => new Date(),
      },
      {
        releaseId: releaseIdNum,
        actor: { id: gate.actor.userId, role: actorRole, status: "active" },
      },
    );

    return NextResponse.json({ release: deactivated });
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    if (err instanceof ReleaseAuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ReleaseNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const mapped = mapRouteError(err, {
      operation: "admin.jurisdiction.release.deactivate",
    });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}